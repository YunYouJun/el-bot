import type { GroupingOptions, HostContext, PeerRecord, QQManager, Route, Scope, Workspace } from './contracts'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'

type Rebuild = QQManager['rebuildSession']
interface Hooks {
  owners: Map<HostContext, WorkspaceGrouping>
  pending: Map<string, WorkspaceGrouping>
  originals: Pick<QQManager, 'registerScopePromptInjection' | 'workspaceDir' | 'openSession' | 'rebuildSession'>
}
const installed = new WeakMap<QQManager, Hooks>()

export function parsePeer(key: string, appId: string): { scope: Scope, peerId: string } | undefined {
  const prefix = `qqbot:${appId}:`
  if (!key.startsWith(prefix))
    return
  const rest = key.slice(prefix.length)
  const separator = rest.indexOf(':')
  const scope = rest.slice(0, separator)
  const peerId = rest.slice(separator + 1)
  if ((scope === 'c2c' || scope === 'group') && separator > 0 && peerId)
    return { scope, peerId }
}

export class WorkspaceGrouping {
  manager?: QQManager
  private managerListeners = new Set<(manager: QQManager) => void>()
  onCaptured?: () => void
  selectLegacy?: (record: PeerRecord, route: Route) => Promise<void>
  readLegacy?: (record: PeerRecord) => Route | undefined
  readonly scope = new AsyncLocalStorage<Scope>()
  readonly queues = new Map<string, Promise<unknown>>()
  closed = false

  watchManager(listener: (manager: QQManager) => void): () => void {
    this.managerListeners.add(listener)
    if (this.manager)
      listener(this.manager)
    return () => {
      this.managerListeners.delete(listener)
    }
  }

  capture(manager: QQManager) {
    this.manager = manager
    for (const listener of this.managerListeners)
      listener(manager)
    this.onCaptured?.()
  }

  constructor(
    readonly ctx: HostContext,
    readonly options: GroupingOptions,
    readonly workspaces: Record<Scope, Workspace>,
  ) {}

  directory(scope: Scope): string {
    return scope === 'c2c' ? this.options.privateDirectory : this.options.groupDirectory
  }

  currentRoute(record: PeerRecord): Route | undefined {
    const selected = record.agent.model?.current() ?? this.readLegacy?.(record) ?? record.agent.options
    return selected?.provider && selected.model ? { ...selected, provider: selected.provider, model: selected.model } : undefined
  }

  async selectModel(record: PeerRecord, route: Route): Promise<void> {
    const model = record.agent.model
    if (!model) {
      if (!this.selectLegacy)
        throw new Error('The host does not expose supported model selection')
      await this.selectLegacy(record, route)
      return
    }
    const current = model.current()
    if (current?.provider !== route.provider || current.model !== route.model)
      await model.select(route)
  }

  async serial<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(() => {
      if (this.closed)
        throw new Error('QQ workspace adapter is disposed')
      return task()
    })
    this.queues.set(key, next)
    try {
      return await next
    }
    finally {
      if (this.queues.get(key) === next)
        this.queues.delete(key)
    }
  }

  async archiveAncestors(manager: QQManager, id: string): Promise<void> {
    const visited = new Set<string>()
    const ownedDirectories = new Set([
      this.options.originalDirectory,
      this.options.privateDirectory,
      this.options.groupDirectory,
    ].map(path => resolve(path)))
    while (!visited.has(id)) {
      visited.add(id)
      const header = await manager.host.sessionHeader(id)
      if (!header?.cwd || !ownedDirectories.has(resolve(header.cwd)))
        return
      await this.ctx.workspaceRegistry.archiveSession(id)
      if (!header.parentSession)
        return
      id = header.parentSession
    }
  }

  async finishFork(manager: QQManager, record: PeerRecord, previousId: string, route?: Route): Promise<void> {
    if (record.sessionId === previousId)
      throw new Error('QQ session fork did not complete; existing history was retained')
    // Current hosts restore a seeded request header over initial agentOptions.
    // Use the public persistent selection API so /model changes the actual route.
    if (route)
      await this.selectModel(record, route)
    await this.workspaces[record.scope].attachSession(record.sessionId)
    await this.archiveAncestors(manager, previousId)
  }

  async organize(manager: QQManager, record: PeerRecord, rebuild: Rebuild): Promise<void> {
    if (this.closed)
      return
    const desired = this.directory(record.scope)
    const route = this.currentRoute(record)
    // npm Web exposes installModelSelection instead of Desktop's model handle.
    // Reinstall the scoped route on resume so an inherited request cannot win.
    if (!record.agent.model && route)
      await this.selectModel(record, route)
    if (record.agent.session.header.cwd && resolve(record.agent.session.header.cwd) === resolve(desired)) {
      await this.workspaces[record.scope].attachSession(record.sessionId)
      const parent = record.agent.session.header.parentSession
      if (parent)
        await this.archiveAncestors(manager, parent)
      return
    }
    if (record.agent.status !== 'idle') {
      void record.agent.whenIdle().then(() => {
        if (!this.closed)
          return this.scope.run(record.scope, () => this.serial(record.sessionKey, () => this.organize(manager, record, rebuild)))
      }).catch(() => this.ctx.logger?.warn('QQ workspace migration deferred; retry after the active turn completes'))
      return
    }
    const previousId = record.sessionId
    await rebuild.call(manager, record, { route })
    await this.finishFork(manager, record, previousId, route)
    this.ctx.logger?.info(`QQ ${record.scope} history migrated to its workspace`)
  }

  async migrateExisting(): Promise<void> {
    const manager = this.manager
    if (!manager)
      throw new Error('Official QQ SessionManager was not captured; check the supported plugin version')
    let data: unknown
    try {
      data = JSON.parse(await readFile(this.options.prefsFile, 'utf8'))
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return
      throw new Error('Could not read QQ session preferences; no migration was attempted', { cause: error })
    }
    if (!data || typeof data !== 'object' || !('sessionIds' in data))
      return
    const sessionIds = data.sessionIds
    if (!sessionIds || typeof sessionIds !== 'object' || Array.isArray(sessionIds))
      throw new Error('Invalid QQ session preference map')
    for (const [key, id] of Object.entries(sessionIds)) {
      const peer = parsePeer(key, this.options.appId)
      if (!peer || typeof id !== 'string' || !id)
        continue
      const access = manager.config.access
      if (peer.scope === 'group' && access.groupMode === 'disabled') {
        continue
      }
      if (peer.scope === 'c2c' && (access.c2cMode === 'disabled'
        || (access.c2cMode === 'allowlist' && !access.c2cAllow.includes(peer.peerId)))) {
        continue
      }
      // /new can mint a preference before a session exists. Do not create it here.
      if (!await manager.host.sessionHeader(id))
        continue
      const senderId = peer.scope === 'c2c' ? peer.peerId : manager.config.access.c2cAllow[0] ?? peer.peerId
      // Web restore can acquire persistence just before publishing its live
      // agent. The official manager reuses that agent on the next attempt.
      // Keep the persisted identity; a lasting or unrelated failure stays loud.
      for (let attempt = 0; ; attempt++) {
        if (this.closed)
          throw new Error('QQ workspace adapter is disposed')
        try {
          await manager.getOrCreate(peer.scope, peer.peerId, senderId, { scope: peer.scope, targetId: peer.peerId, msgId: '' })
          break
        }
        catch (error) {
          if (!(error instanceof Error) || error.name !== 'SessionAlreadyOwnedError' || attempt >= 29)
            throw error
          await setTimeout(100)
        }
      }
    }
  }
}

/** Scope private upstream hooks to this wrapper's context; never patch vendor files. */
export function installHooks(prototype: QQManager, grouping: WorkspaceGrouping, matchAppId = false): () => void {
  let hooks = installed.get(prototype)
  if (!hooks) {
    for (const method of ['registerScopePromptInjection', 'workspaceDir', 'openSession', 'rebuildSession'] as const) {
      if (typeof prototype[method] !== 'function')
        throw new Error(`Unsupported QQ plugin: missing ${method}`)
    }
    hooks = {
      owners: new Map(),
      pending: new Map(),
      originals: {
        registerScopePromptInjection: prototype.registerScopePromptInjection,
        workspaceDir: prototype.workspaceDir,
        openSession: prototype.openSession,
        rebuildSession: prototype.rebuildSession,
      },
    }
    installed.set(prototype, hooks)
    const state = hooks
    prototype.registerScopePromptInjection = function () {
      state.originals.registerScopePromptInjection.call(this)
      const owner = state.owners.get(this.ctx) ?? state.pending.get(this.config.appId)
      if (owner) {
        state.owners.set(this.ctx, owner)
        owner.capture(this)
      }
    }
    prototype.workspaceDir = function () {
      const owner = state.owners.get(this.ctx)
      const scope = owner?.scope.getStore()
      return owner && scope ? owner.directory(scope) : state.originals.workspaceDir.call(this)
    }
    prototype.openSession = async function (key, scope, peerId, senderId, target) {
      const owner = state.owners.get(this.ctx)
      if (!owner)
        return state.originals.openSession.call(this, key, scope, peerId, senderId, target)
      return owner.scope.run(scope, () => owner.serial(key, async () => {
        const record = await state.originals.openSession.call(this, key, scope, peerId, senderId, target)
        await owner.organize(this, record, state.originals.rebuildSession)
        return record
      }))
    }
    prototype.rebuildSession = async function (record, options) {
      const owner = state.owners.get(this.ctx)
      if (!owner)
        return state.originals.rebuildSession.call(this, record, options)
      return owner.scope.run(record.scope, () => owner.serial(record.sessionKey, async () => {
        const previousId = record.sessionId
        await state.originals.rebuildSession.call(this, record, options)
        await owner.finishFork(this, record, previousId, options.route)
      }))
    }
  }
  if (hooks.owners.has(grouping.ctx))
    throw new Error('QQ workspace adapter is already installed for this context')
  if (matchAppId) {
    if (hooks.pending.has(grouping.options.appId))
      throw new Error('QQ workspace adapter already owns this AppID')
    hooks.pending.set(grouping.options.appId, grouping)
  }
  hooks.owners.set(grouping.ctx, grouping)
  const state = hooks
  return () => {
    grouping.closed = true
    for (const [ctx, owner] of state.owners) {
      if (owner === grouping)
        state.owners.delete(ctx)
    }
    if (state.pending.get(grouping.options.appId) === grouping)
      state.pending.delete(grouping.options.appId)
    if (state.owners.size === 0) {
      Object.assign(prototype, state.originals)
      installed.delete(prototype)
    }
  }
}
