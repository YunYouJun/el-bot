import type { PersonaImport, PersonaLibraryState, PersonaPreview } from '@el-bot/persona'
import type { DshPersonaResult } from './types'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'
import { PersonaLibrary } from '@el-bot/persona'

export const WEB_PATH = '/el-bot/personas'
export const API_PATH = `${WEB_PATH}/api`
export interface Settings { profileDirectory?: string, title?: string }
export type PersonaOperation = 'list' | 'import' | 'preview' | 'use' | 'disable' | 'update'
export interface PersonaRequest { operation: PersonaOperation, id?: string, revision?: string, input?: PersonaImport }

export function profileDirectory(explicit?: string, argv = process.argv, home = homedir()) {
  if (explicit) {
    if (!isAbsolute(explicit) || explicit.includes('\0'))
      throw new Error('DSH profileDirectory must be an absolute path')
    return explicit
  }
  const index = argv.indexOf('--profile')
  const profile = index >= 0 ? argv[index + 1] : 'desktop'
  if (!profile || !/^[a-z0-9][\w-]{0,63}$/i.test(profile))
    throw new Error('DSH profile name is invalid')
  return join(process.env.DSH_HOME ?? join(home, '.dsh'), 'profiles', profile)
}

/** One instance library used by the DSH page, runtime, and authenticated SSH shortcut. */
export class PersonaService {
  readonly library: PersonaLibrary
  readonly profile: string
  runtime?: () => NonNullable<DshPersonaResult['runtime']>
  constructor(readonly settings: Settings = {}) {
    this.profile = profileDirectory(settings.profileDirectory)
    this.library = new PersonaLibrary(join(this.profile, 'el-bot-personas'))
  }

  async request(request: PersonaRequest, browser = false): Promise<DshPersonaResult> {
    if (!request || typeof request !== 'object')
      throw new Error('人物卡请求无效。')
    let preview: PersonaPreview | undefined
    const id = request.id
    if (request.operation === 'import') {
      const input = request.input
      if (!input || typeof input !== 'object')
        throw new Error('请选择人物卡来源。')
      if (browser && input.kind !== 'text' && input.kind !== 'url' && input.kind !== 'git')
        throw new Error('请使用文件选择器上传人物卡。')
      if (browser && input.kind === 'git' && !input.repository?.startsWith('https://'))
        throw new Error('网页仅支持公开 HTTPS Git 仓库。')
      const card = await this.library.import(input)
      preview = await this.library.preview(card.metadata.id, card.hash)
    }
    else if (request.operation === 'preview' || request.operation === 'update' || request.operation === 'use') {
      if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id))
        throw new Error('请选择有效人物卡。')
      if (request.revision !== undefined && !/^[a-f0-9]{64}$/.test(request.revision))
        throw new Error('请选择有效人物卡版本。')
      if (request.operation === 'preview') {
        preview = await this.library.preview(id, request.revision)
      }
      else if (request.operation === 'update') {
        const card = await this.library.update(id)
        preview = await this.library.preview(id, card.hash)
      }
      else {
        await this.library.select(id, request.revision)
      }
    }
    else if (request.operation === 'disable') {
      await this.library.select(null)
    }
    else if (request.operation !== 'list') {
      throw new Error('未知人物卡操作。')
    }
    return this.result(await this.library.list(), preview)
  }

  result(library: PersonaLibraryState, preview?: PersonaPreview): DshPersonaResult {
    return { library, ...(preview ? { preview } : {}), instance: { title: this.settings.title ?? 'DSH 机器人', profile: this.profile.split(/[/\\]/).at(-1) ?? 'DSH' }, ...(this.runtime ? { runtime: this.runtime() } : {}) }
  }
}
