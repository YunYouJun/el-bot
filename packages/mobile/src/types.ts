import type { IncomingMessage, ServerResponse } from 'node:http'

export interface Device {
  id: string
  name: string
  createdAt: string
  expiresAt: string
}

export interface SessionSummary {
  id: string
  title: string
  updatedAt: string
  running: boolean
  workspace?: string
  provider?: string
  model?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
}

export interface Conversation {
  session: SessionSummary
  messages: ChatMessage[]
  hasMore: boolean
  cursor: number
}

export interface BotStatus {
  name: string
  appId: string
  state: 'online' | 'offline' | 'connecting' | 'unknown'
  checkedAt: string
}

/** Only these capabilities are reachable from a paired phone. */
export interface MobileHost {
  list: (signal: AbortSignal) => Promise<SessionSummary[]>
  conversation: (id: string, signal: AbortSignal, before?: number) => Promise<Conversation>
  prompt: (id: string, text: string, requestId: string, signal: AbortSignal) => Promise<void>
  create: (requestId: string) => Promise<string>
  status: () => Promise<BotStatus>
}

export interface MobileContext {
  webServer: {
    register: (route: { kind: 'prefix', path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) => () => void
  }
  sessionController: unknown
  workspaceRegistry: unknown
  effect: (install: () => Promise<() => Promise<void>>) => unknown
}

export interface MobileSettings {
  profileDirectory?: string
  publicBaseUrl: string
  appId?: string
  botName?: string
  workspaceDirectory?: string
}
