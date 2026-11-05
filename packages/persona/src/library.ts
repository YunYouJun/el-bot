import type { PersonaImport, PersonaLibraryState, PersonaPreview, PersonaRevision } from './types'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cardHash, parsePersona, validPersonaId } from './card'
import { importPersona } from './import'

const validHash = (hash: string) => /^[a-f0-9]{64}$/.test(hash)

/** A caller-owned library, including its active selection, isolated per bot instance. */
export class PersonaLibrary {
  readonly directory: string
  constructor(directory: string) { this.directory = resolve(directory) }

  async list(): Promise<PersonaLibraryState> {
    let text: string
    try {
      text = await readFile(join(this.directory, 'index.json'), 'utf8')
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, cards: [] }
      throw error
    }
    try {
      if (Buffer.byteLength(text) > 1024 * 1024)
        throw new Error('Oversized index')
      const state: PersonaLibraryState = JSON.parse(text)
      if (state.version !== 1 || !Array.isArray(state.cards) || state.cards.length > 100)
        throw new Error('Invalid index')
      const ids = new Set<string>()
      for (const card of state.cards) {
        if (!validPersonaId(card.metadata.id) || ids.has(card.metadata.id) || !validHash(card.hash) || !Array.isArray(card.revisions) || !card.revisions.length || card.revisions.length > 20)
          throw new Error('Invalid card')
        ids.add(card.metadata.id)
        for (const revision of card.revisions) {
          if (!validHash(revision.hash) || revision.metadata.id !== card.metadata.id || typeof revision.metadata.name !== 'string' || typeof revision.importedAt !== 'string' || !['file', 'url', 'git', 'text'].includes(revision.source.kind))
            throw new Error('Invalid revision')
        }
        if (!card.revisions.some(revision => revision.hash === card.hash))
          throw new Error('Missing current revision')
      }
      if (state.active && !state.cards.some(card => card.metadata.id === state.active!.id && card.revisions.some(revision => revision.hash === state.active!.hash)))
        throw new Error('Invalid selection')
      return state
    }
    catch { throw new Error('人物卡目录损坏；请恢复 index.json 备份，不会自动重置当前人设。') }
  }

  async preview(id: string, hash?: string): Promise<PersonaPreview> {
    const state = await this.list()
    const card = state.cards.find(card => card.metadata.id === id)
    const revision = card?.revisions.find(revision => revision.hash === (hash ?? card.hash))
    if (!revision)
      throw new Error('找不到人物卡或指定版本。')
    const markdown = await readFile(join(this.directory, `${revision.hash}.md`), 'utf8')
    if (cardHash(markdown) !== revision.hash)
      throw new Error('人物卡本地快照校验失败；请重新导入，不会使用已改动内容。')
    const parsed = parsePersona(markdown, id, id)
    return { ...revision, markdown, body: parsed.body }
  }

  async active(): Promise<PersonaPreview | undefined> {
    const selection = (await this.list()).active
    return selection ? this.preview(selection.id, selection.hash) : undefined
  }

  private async mutate<T>(work: (state: PersonaLibraryState) => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const lockPath = join(this.directory, 'write.lock')
    const lock = await open(lockPath, 'wx', 0o600).catch(() => {
      throw new Error('人物卡目录正在保存或不可写；请稍后重试。')
    })
    const temporary = join(this.directory, `index-${randomUUID()}.tmp`)
    try {
      const state = await this.list()
      const previousHashes = new Set(state.cards.flatMap(card => card.revisions.map(revision => revision.hash)))
      const result = await work(state)
      const serialized = `${JSON.stringify(state, null, 2)}\n`
      if (Buffer.byteLength(serialized) > 1024 * 1024)
        throw new Error('人物卡目录超过 1 MiB；请缩短元数据或使用其他实例目录。原目录未修改。')
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(serialized)
        await file.sync()
      }
      finally { await file.close() }
      await rename(temporary, join(this.directory, 'index.json'))
      const retained = new Set(state.cards.flatMap(card => card.revisions.map(revision => revision.hash)))
      for (const hash of previousHashes) {
        if (!retained.has(hash))
          await unlink(join(this.directory, `${hash}.md`)).catch(() => {})
      }
      return result
    }
    finally {
      await unlink(temporary).catch(() => {})
      await lock.close()
      await unlink(lockPath)
    }
  }

  async import(request: PersonaImport, id?: string) {
    const input = await importPersona(request)
    const parsed = parsePersona(input.text, input.filename, id)
    return this.mutate(async (state) => {
      const previous = state.cards.find(card => card.metadata.id === parsed.metadata.id)
      if (!previous && state.cards.length >= 100)
        throw new Error('本地人物卡目录最多保存 100 张卡片。')
      const path = join(this.directory, `${parsed.hash}.md`)
      // Repair a corrupt snapshot only through an explicit import of verified content.
      const temporary = join(this.directory, `card-${randomUUID()}.tmp`)
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(parsed.markdown)
        await file.sync()
        await file.close()
        await rename(temporary, path)
      }
      finally {
        await file.close()
        await unlink(temporary).catch(() => {})
      }
      const revision: PersonaRevision = { hash: parsed.hash, metadata: parsed.metadata, source: input.source, importedAt: new Date().toISOString() }
      const revisions = [revision, ...(previous?.revisions ?? []).filter(item => item.hash !== revision.hash)]
      // Keep the enabled version even when importing many newer revisions.
      const active = revisions.find(item => state.active?.id === parsed.metadata.id && state.active.hash === item.hash)
      const retained = revisions.slice(0, 20)
      if (active && !retained.includes(active))
        retained[19] = active
      const card = { ...revision, revisions: retained }
      state.cards = [...state.cards.filter(item => item.metadata.id !== parsed.metadata.id), card]
      return card
    })
  }

  async select(id: string | null, hash?: string): Promise<PersonaLibraryState> {
    if (id !== null)
      await this.preview(id, hash)
    return this.mutate(async (state) => {
      if (id === null) {
        delete state.active
      }
      else {
        const card = state.cards.find(card => card.metadata.id === id)
        const revision = card?.revisions.find(item => item.hash === (hash ?? card.hash))
        if (!revision)
          throw new Error('人物卡版本已变化，请刷新后重试。')
        state.active = { id, hash: revision.hash }
      }
      return state
    })
  }

  async update(id: string) {
    const card = (await this.list()).cards.find(card => card.metadata.id === id)
    if (!card)
      throw new Error('找不到人物卡。')
    if (card.source.kind === 'text')
      throw new Error('此人物卡来自上传文件，请重新选择文件导入。')
    return this.import(card.source, id)
  }
}
