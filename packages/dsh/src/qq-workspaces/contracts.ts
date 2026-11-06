/** Structural contracts keep the adapter independent of the host's private npm registry. */
export type Scope = 'c2c' | 'group'
export interface Route { provider: string, model: string, reasoningEffort?: string }
export interface Header { id: string, cwd?: string, parentSession?: string }
export interface Workspace {
  path: string
  title: string
  sessionIds: readonly string[]
  setTitle: (title: string) => Promise<void>
  attachSession: (id: string) => Promise<void>
}
export interface HostContext {
  get?: (name: string) => unknown
  provide?: (name: string, value: unknown) => unknown
  baseUrl?: string
  loader?: { internal?: { import: (specifier: string, baseUrl: string, options: object) => Promise<unknown> } }
  workspaceRegistry: {
    create: (path: string, title: string) => Promise<Workspace>
    archiveSession: (id: string) => Promise<void>
  }
  logger?: { info: (message: string) => void, warn: (message: string) => void }
  effect: (install: () => () => void, label: string) => unknown
}
export interface PeerRecord {
  sessionKey: string
  sessionId: string
  scope: Scope
  peerId: string
  agent: {
    status: string
    session: { header: Header, append?: (type: string, data: Route) => unknown }
    model?: { current: () => Route | undefined, select: (route: Route) => unknown }
    options?: Partial<Route>
    ctx?: unknown
    whenIdle: () => Promise<void>
  }
}
export interface QQManager {
  modelResolver?: { setOverride: (key: string, route: Route) => void }
  ctx: HostContext
  config: { appId: string, access: { c2cAllow: string[] } }
  host: { sessionHeader: (id: string) => Promise<Header | undefined> }
  registerScopePromptInjection: () => void
  workspaceDir: () => string
  sessionKey: (scope: Scope, peerId: string) => string
  openSession: (key: string, scope: Scope, peerId: string, senderId: string, target: ReplyTarget) => Promise<PeerRecord>
  getOrCreate: (scope: Scope, peerId: string, senderId: string, target: ReplyTarget) => Promise<PeerRecord>
  rebuildSession: (record: PeerRecord, options: { route?: Route }) => Promise<void>
}
export interface ReplyTarget { scope: Scope, targetId: string, msgId: string }
export interface GroupingOptions {
  appId: string
  prefsFile: string
  originalDirectory: string
  privateDirectory: string
  groupDirectory: string
  privateTitle: string
  groupTitle: string
}
