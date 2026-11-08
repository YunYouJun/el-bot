import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

interface Counter { count: number, until: number }
interface Binding { peer: string, turns: number }
interface State { version: 1, counters: Record<string, Counter>, sessions: Record<string, Binding> }
export interface Budget { key: string, limit: number, duration: number }
const MAX_BYTES = 2 * 1024 * 1024
const MAX_ENTRIES = 8192

/** One receiver owns the journal. Serialize admission and commit before doing any work. */
export class QQStateStore {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(readonly path: string, private readonly now = Date.now) {}

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task)
    this.queue = result.catch(() => {})
    return result
  }

  private async load(): Promise<State> {
    try {
      if ((await stat(this.path)).size > MAX_BYTES)
        throw new Error('Oversized security journal')
      const data = JSON.parse(await readFile(this.path, 'utf8')) as State
      if (data.version !== 1 || !data.counters || !data.sessions
        || typeof data.counters !== 'object' || typeof data.sessions !== 'object'
        || Array.isArray(data.counters) || Array.isArray(data.sessions)
        || Object.keys(data.counters).length > MAX_ENTRIES || Object.keys(data.sessions).length > MAX_ENTRIES
        || Object.entries(data.counters).some(([key, value]) => !/^[a-f0-9]{64}$/.test(key) || !value
          || !Number.isSafeInteger(value.count) || value.count < 0 || !Number.isSafeInteger(value.until) || value.until < 0)
        || Object.entries(data.sessions).some(([id, value]) => !id || !value || !/^[a-f0-9]{64}$/.test(value.peer)
          || !Number.isSafeInteger(value.turns) || value.turns < 0)) {
        throw new Error('Invalid security journal')
      }
      return data
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, counters: {}, sessions: {} }
      throw new Error('QQ security journal is unreadable; admission is closed', { cause: error })
    }
  }

  private async save(state: State) {
    const text = `${JSON.stringify(state)}\n`
    if (Buffer.byteLength(text) > MAX_BYTES)
      throw new Error('QQ security journal is full')
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, text, { mode: 0o600, flag: 'wx' })
      await rename(temporary, this.path)
    }
    finally { await unlink(temporary).catch(() => {}) }
  }

  async binding(id: string) {
    return this.serial(async () => (await this.load()).sessions[id])
  }

  async bind(id: string, peer: string) {
    await this.serial(async () => {
      const data = await this.load()
      if (data.sessions[id] && data.sessions[id].peer !== peer)
        throw new Error('QQ session belongs to another peer')
      data.sessions[id] ??= { peer, turns: 0 }
      if (Object.keys(data.sessions).length > MAX_ENTRIES)
        throw new Error('QQ security session journal is full')
      await this.save(data)
    })
  }

  async take(budgets: Budget[], sessionId?: string): Promise<boolean> {
    return this.serial(async () => {
      const data = await this.load()
      const now = this.now()
      data.counters = Object.fromEntries(Object.entries(data.counters).filter(([, value]) => value.until > now))
      for (const budget of budgets) {
        if ((data.counters[budget.key]?.count ?? 0) >= budget.limit)
          return false
      }
      if (sessionId && !data.sessions[sessionId])
        throw new Error('Group session was not admitted')
      for (const budget of budgets) {
        data.counters[budget.key] ??= { count: 0, until: now + budget.duration }
        data.counters[budget.key].count++
      }
      if (sessionId)
        data.sessions[sessionId].turns++
      if (Object.keys(data.counters).length > MAX_ENTRIES)
        return false
      await this.save(data)
      return true
    })
  }
}
