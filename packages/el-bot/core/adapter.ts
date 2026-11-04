/** A message scoped to one platform connection and one reply target. */
export interface MessageContext {
  adapterId: string
  platform: string
  accountId: string
  id: string
  text: string
  sender: { id: string, name?: string }
  chat: { id: string, type: 'dm' | 'group' }
  addressed: boolean
  raw?: unknown
  reply: (content: string) => Promise<unknown>
}

export interface MessageTarget {
  id: string
  type: 'dm' | 'group'
}

export interface BotAdapter {
  id: string
  platform: string
  start: (dispatch: (message: MessageContext) => Promise<void>) => void | Promise<void>
  stop: () => void | Promise<void>
  send?: (target: MessageTarget, content: string) => Promise<unknown>
}

export interface AdapterHost {
  registerAdapter: (adapter: BotAdapter) => void
}

/** Structurally compatible with BotPlugin without importing the framework runtime. */
export interface AdapterPlugin {
  pkg: { name: string, description?: string }
  platform: string
  setup: (host: AdapterHost) => void | Promise<void>
}
export { AdapterRegistry } from './bot/adapters'
