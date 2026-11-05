import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PeerRecord, QQManager } from './qq-workspaces/contracts'

export interface ManagedQQ extends Pick<QQManager, 'getOrCreate' | 'sessionKey'> {
  findByAgent: (agent: unknown) => PeerRecord | undefined
  remove: (scope: 'c2c' | 'group', peerId: string) => Promise<void>
}
export interface PromptAssembly {
  sections: unknown[]
  contexts?: { name: string, text: string, interpolate?: boolean }[]
  [key: string]: unknown
}
export interface PersonaContext {
  webServer: { register: (route: { kind: 'exact' | 'prefix', path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) => () => void }
  connection: { requestRejection: (request: IncomingMessage) => number | undefined }
  get: (name: string) => unknown
  provide: (name: string, value: unknown) => void
  on: (name: 'system-prompt/assemble', listener: (assembly: PromptAssembly, context: { agent?: object }, next: () => Promise<PromptAssembly>) => Promise<PromptAssembly>) => () => void
  effect: (install: () => (() => void)) => unknown
}
