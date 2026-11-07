import type { SessionSource } from './types'
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { MobileError } from './http'

interface Agent { id: string, status: string }
interface Handle { agent: Agent, dispose: () => Promise<void> }
interface Runtime {
  agents: {
    get: (id: string) => Agent | undefined
    create: (...args: unknown[]) => Promise<Handle>
    resume: (...args: unknown[]) => Promise<Handle>
  }
  sessions: { get: (id: string) => unknown }
  sessionPersistence: {
    name: string
    root: string
    locate: (header: { id: string }) => { kind: string, path: string }
    stat: (id: string) => Promise<{ header: { id: string } } | undefined>
    open: (id: string, access: 'write') => Promise<{ close: () => Promise<void> }>
  }
  activity?: (id: string) => Promise<readonly unknown[]>
  eraseProjectionCache?: (id: string) => Promise<void>
  workspaceRegistry: {
    archivedSessionIds: readonly string[]
    archiveSession: (id: string) => Promise<void>
    unarchiveSession: (id: string) => Promise<void>
  }
}
interface Entry { source?: SessionSource, phase?: 'deleting' | 'deleted' }

/** Version-pinned bridge: DSH rc.5 has archive admission, but no public erase verb. */
export class SessionLifecycle {
  private entries: Record<string, Entry> = Object.create(null)
  private closing?: Promise<void>
  private saving: Promise<unknown> = Promise.resolve()
  private readonly handles = new Map<string, Handle>()
  private readonly mutations = new Map<string, Promise<unknown>>()
  private readonly restores: (() => void)[] = []

  constructor(private readonly runtime: Runtime, private readonly path: string) {
    for (const method of ['create', 'resume'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(runtime.agents, method)
      // Read an untraced method. Saving a Cordis Context proxy as the original
      // would retain this plugin's disposed fiber after a hot reload.
      const original = (descriptor?.value ?? Reflect.get(Object.getPrototypeOf(runtime.agents), method)) as Runtime['agents'][typeof method]
      if (typeof original !== 'function')
        throw new Error(`DSH agent lifecycle capability is unavailable: ${method}`)
      const handles = this.handles
      runtime.agents[method] = async function (...args) {
        const handle = await original.apply(this, args)
        handles.set(handle.agent.id, handle)
        return handle
      }
      this.restores.push(() => {
        if (descriptor)
          Object.defineProperty(runtime.agents, method, descriptor)
        else Reflect.deleteProperty(runtime.agents, method)
      })
    }
  }

  async load() {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid session lifecycle journal')
      for (const [id, entry] of Object.entries(value)) {
        if (!/^[\w-]{1,128}$/.test(id) || !entry || typeof entry !== 'object'
          || ('phase' in entry && entry.phase !== 'deleting' && entry.phase !== 'deleted')) {
          throw new Error('Invalid session lifecycle entry')
        }
      }
      this.entries = Object.assign(Object.create(null), value)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
  }

  get pending() { return Object.keys(this.entries).filter(id => this.entries[id]?.phase === 'deleting') }
  deleted(id: string) { return this.entries[id]?.phase === 'deleted' }
  source(id: string) { return this.entries[id]?.source }
  assertAvailable(id: string) {
    if (this.entries[id]?.phase)
      throw new MobileError(this.deleted(id) ? 404 : 409, this.deleted(id) ? 'session_not_found' : 'session_deleting')
  }

  async remember(id: string, source?: SessionSource) {
    this.assertAvailable(id)
    if (source) {
      // The registry needs identity and display metadata, never another copy of chat text.
      const { lastMessage: _message, ...identity } = source
      this.entries[id] = { ...this.entries[id], source: identity }
      await this.save()
    }
  }

  archive(id: string, archived: boolean) {
    return this.serial(id, () => this.setArchived(id, archived))
  }

  private async setArchived(id: string, archived: boolean) {
    this.assertAvailable(id)
    if (archived)
      await this.fence(id)
    else
      await this.runtime.workspaceRegistry.unarchiveSession(id)
  }

  /** Archive's host-wide admission fence also checks jobs, descendants and schedules. */
  erase(id: string, detach: () => Promise<void>) {
    return this.serial(id, () => this.eraseSession(id, detach))
  }

  private async eraseSession(id: string, detach: () => Promise<void>) {
    if (this.deleted(id))
      return
    const runtime = this.runtime
    const backend = runtime.sessionPersistence
    if (backend.name !== 'session-persistence-jsonl' || !isAbsolute(backend.root) || typeof backend.locate !== 'function')
      throw new MobileError(503, 'session_deletion_unsupported')
    await this.ensureInactive(id)
    // Admission is checked again after the archive write: a Web prompt could
    // have started while the registry was committing its durable archive set.
    await this.fence(id)
    this.entries[id] = { phase: 'deleting' }
    await this.save()
    await detach()
    const handle = this.handles.get(id)
    if (handle && runtime.agents.get(id) === handle.agent) {
      await handle.dispose()
    }
    this.handles.delete(id)
    if (runtime.agents.get(id) || runtime.sessions.get(id))
      throw new MobileError(409, 'session_owner_unavailable')
    const snapshot = await backend.stat(id)
    if (snapshot) {
      const location = backend.locate(snapshot.header)
      const root = await realpath(backend.root)
      const directory = dirname(location.path)
      const inside = relative(resolve(backend.root), directory)
      if (location.kind !== 'jsonl' || !inside || inside.startsWith(`..${sep}`) || inside === '..' || isAbsolute(inside))
        throw new MobileError(503, 'invalid_session_location')
      // Refuse symlink traversal, including project and session directory links.
      let current = root
      for (const segment of inside.split(sep)) {
        current = resolve(current, segment)
        if ((await lstat(current)).isSymbolicLink())
          throw new MobileError(503, 'invalid_session_location')
      }
      // Foreign writers must release ownership first. Closing a clean write handle
      // cannot recreate content; the archived identity prevents host reactivation.
      const lease = await backend.open(id, 'write')
      await lease.close()
      await rm(current, { recursive: true })
      if (await backend.stat(id))
        throw new MobileError(503, 'session_deletion_unconfirmed')
    }
    await runtime.eraseProjectionCache?.(id)
    this.entries[id] = { phase: 'deleted' }
    await this.save()
  }

  admit<T>(id: string, operation: () => Promise<T>): Promise<T> {
    return this.serial(id, async () => {
      this.assertAvailable(id)
      if (this.runtime.workspaceRegistry.archivedSessionIds.includes(id))
        throw new MobileError(409, 'session_archived')
      return operation()
    })
  }

  private async ensureInactive(id: string) {
    const agent = this.runtime.agents.get(id)
    if ((agent && agent.status !== 'idle') || (await this.runtime.activity?.(id))?.length)
      throw new MobileError(409, 'session_active')
  }

  private async fence(id: string) {
    const registry = this.runtime.workspaceRegistry
    const wasArchived = registry.archivedSessionIds.includes(id)
    await registry.archiveSession(id)
    try {
      await this.ensureInactive(id)
    }
    catch (error) {
      if (!wasArchived)
        await registry.unarchiveSession(id)
      throw error
    }
  }

  close(): Promise<void> {
    this.closing ??= (async () => {
      for (const restore of this.restores.reverse()) restore()
      await Promise.allSettled(this.mutations.values())
      await this.saving
    })()
    return this.closing
  }

  private async serial<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const task = (this.mutations.get(id) ?? Promise.resolve()).catch(() => {}).then(operation)
    this.mutations.set(id, task)
    try {
      return await task
    }
    finally {
      if (this.mutations.get(id) === task)
        this.mutations.delete(id)
    }
  }

  private save() {
    const json = `${JSON.stringify(this.entries)}\n`
    const task = this.saving.catch(() => {}).then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      await writeFile(`${this.path}.tmp`, json, { mode: 0o600 })
      await rename(`${this.path}.tmp`, this.path)
    })
    this.saving = task
    return task
  }
}

export type SessionLifecycleRuntime = Runtime
