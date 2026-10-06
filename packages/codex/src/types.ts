export type RpcId = string | number
export interface RpcRequest {
  id: RpcId
  method: string
  params: Record<string, unknown>
}
export interface RpcNotification {
  method: string
  params: Record<string, unknown>
}
export interface CodexOptions {
  executable?: string
  /** Isolate local account configuration and session storage when explicitly selected. */
  codexHome?: string
  envAllowlist?: string[]
  /** Attach to a running app-server without owning or stopping that server. */
  connection?: 'stdio' | 'desktop'
  socketPath?: string
  experimentalApi?: boolean
  /** Opt into scoped terminal control for confirmed task cancellation. */
  terminalControl?: boolean
  /** Explicit arguments support protocol test fixtures; production uses app-server. */
  args?: string[]
  requestTimeoutMs?: number
}
export interface ThreadOptions {
  cwd: string
  model?: string
  threadId?: string
}
export interface TurnResult {
  turn: { id: string }
}

export interface AcpOptions {
  provider: 'codebuddy' | 'dsh'
  executable?: string
  envAllowlist?: string[]
  projects: string[]
  /** Explicit arguments are reserved for protocol fixtures. */
  args?: string[]
  requestTimeoutMs?: number
}
export interface ThreadResult {
  thread: { id: string, cwd: string }
}
export type ReviewTarget
  = { type: 'uncommittedChanges' }
    | { type: 'baseBranch', branch: string }
    | { type: 'commit', sha: string, title?: string }
    | { type: 'custom', instructions: string }
