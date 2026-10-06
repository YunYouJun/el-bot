import type { CodexClient } from './client'
import type { RpcNotification, RpcRequest } from './types'

interface AgentEvents {
  on: {
    (event: 'notification', listener: (notice: RpcNotification) => void): unknown
    (event: 'request', listener: (request: RpcRequest) => void): unknown
    (event: 'disconnect', listener: (error: Error) => void): unknown
  }
}

/** Task surface shared by Codex app-server and ACP agents. */
export type AgentClient = Pick<CodexClient, 'start' | 'close' | 'request' | 'respond' | 'reject' | 'thread' | 'turn' | 'interrupt' | 'steer' | 'review' | 'forkThread'> & AgentEvents & {
  readonly provider?: 'codebuddy' | 'dsh'
  inspectThread?: (id: string, cwd: string) => Promise<'ready' | 'missing' | 'project-changed' | 'unavailable'>
}
