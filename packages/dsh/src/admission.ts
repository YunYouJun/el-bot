import type { PersonaPreview } from '@el-bot/persona'
import type { ManagedQQ } from './contracts'
import type { PersonaService } from './service'
import { randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { personaPrompt } from '@el-bot/persona'

/** A character revision is frozen at QQ admission, never changed during a turn. */
export class PersonaAdmission {
  private snapshots = new WeakMap<object, PersonaPreview | undefined>()
  private known = new WeakSet<object>()
  private bindings: Record<string, string> = {}
  private loading?: Promise<void>
  private writes = Promise.resolve()
  private queues = new Map<string, Promise<unknown>>()
  private managers = new Set<ManagedQQ>()

  constructor(readonly service: PersonaService) {}

  private async load() {
    this.loading ??= (async () => {
      try {
        const text = await readFile(join(this.service.library.directory, 'sessions.json'), 'utf8')
        if (text.length > 1024 * 1024)
          throw new Error('Oversized persona session map')
        const value = JSON.parse(text)
        if (value.version !== 1 || !value.bindings || typeof value.bindings !== 'object' || Array.isArray(value.bindings)
          || Object.values(value.bindings).some(key => typeof key !== 'string' || (key !== 'default' && !/^[a-z0-9][a-z0-9_-]{0,63}:[a-f0-9]{64}$/.test(key)))) {
          throw new Error('Invalid persona session map')
        }
        this.bindings = value.bindings
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error('人设会话记录损坏；请恢复备份，不会自动覆盖。')
      }
    })()
    await this.loading
  }

  private save(id: string, key: string) {
    this.bindings[id] = key
    const entries = Object.entries(this.bindings).slice(-5000)
    this.bindings = Object.fromEntries(entries)
    const serialized = JSON.stringify({ version: 1, bindings: this.bindings })
    const task = this.writes.then(async () => {
      // The library directory is created on first import/selection, including disable.
      const { mkdir } = await import('node:fs/promises')
      await mkdir(this.service.library.directory, { recursive: true, mode: 0o700 })
      const path = join(this.service.library.directory, 'sessions.json')
      const temporary = `${path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 })
        await rename(temporary, path)
      }
      finally { await unlink(temporary).catch(() => {}) }
    })
    this.writes = task.catch(() => {})
    return task
  }

  attach(manager: ManagedQQ): () => void {
    if (typeof manager.getOrCreate !== 'function' || typeof manager.remove !== 'function' || typeof manager.findByAgent !== 'function')
      throw new Error('The QQ plugin does not expose supported persona admission methods')
    const original = manager.getOrCreate
    const wrapped: ManagedQQ['getOrCreate'] = async (...args) => {
      const sessionKey = manager.sessionKey(args[0], args[1])
      const previous = this.queues.get(sessionKey) ?? Promise.resolve()
      const task = previous.catch(() => {}).then(async () => {
        await this.load()
        const selected = await this.service.library.active()
        const key = selected ? `${selected.metadata.id}:${selected.hash}` : 'default'
        let record = await original.apply(manager, args)
        const id = record.sessionId
        const bound = this.bindings[id] ?? 'default'
        if (bound !== key && record.agent.status === 'idle') {
          // Same operation as QQ /new; it leaves historical sessions on disk.
          // No await occurs between checking idle and removing the idle handle.
          await manager.remove(record.scope, record.peerId)
          record = await original.apply(manager, args)
        }
        if (!this.known.has(record.agent)) {
          const effectiveKey = this.bindings[record.sessionId] ?? 'default'
          const effective = effectiveKey === key
            ? selected
            : effectiveKey === 'default'
              ? undefined
              : await this.service.library.preview(effectiveKey.slice(0, effectiveKey.indexOf(':')), effectiveKey.slice(effectiveKey.indexOf(':') + 1))
          // A freshly created idle record after /new can receive the new selection.
          const snapshot = record.sessionId !== id ? selected : effective
          this.snapshots.set(record.agent, snapshot)
          this.known.add(record.agent)
          await this.save(record.sessionId, snapshot ? `${snapshot.metadata.id}:${snapshot.hash}` : 'default')
        }
        return record
      })
      this.queues.set(sessionKey, task)
      try {
        return await task
      }
      finally {
        if (this.queues.get(sessionKey) === task)
          this.queues.delete(sessionKey)
      }
    }
    manager.getOrCreate = wrapped
    this.managers.add(manager)
    return () => {
      if (manager.getOrCreate === wrapped)
        manager.getOrCreate = original
      this.managers.delete(manager)
    }
  }

  context(agent?: object): string | undefined {
    if (!agent || !this.known.has(agent))
      return
    const snapshot = this.snapshots.get(agent)
    return snapshot ? personaPrompt('', snapshot) : undefined
  }

  counts() {
    return { managedSessions: Object.keys(this.bindings).length, pendingSessions: this.queues.size, attachedBots: this.managers.size }
  }
}
