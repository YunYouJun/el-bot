import type { ManagedQQ, PromptAssembly } from '../contracts'
import type { PeerRecord } from '../qq-workspaces/contracts'

export interface SecuritySettings {
  appId: string
  ownerOpenId: string
  groupAllow?: string[]
  profileDirectory?: string
}

export interface Target { scope: string, targetId: string, msgId?: string }
export interface Inbound {
  kind: string
  senderId: string
  groupOpenid?: string
  messageId: string
  content: string
  rawEventType?: string
  mentions?: { is_you?: boolean }[]
  msgIdx?: string
  refMsgIdx?: string
  msgElements?: unknown[]
  attachments?: unknown[]
}
export interface InboundContext {
  bot: Gateway
  message: Inbound
  replyTarget: Target
  state: Record<string, unknown>
  stop: (reason?: string) => void
}
export type Middleware = (ctx: InboundContext, next: () => Promise<void>) => Promise<void>
export interface Interaction {
  scene?: string
  id: string
  user_openid?: string
  group_openid?: string
  group_member_openid?: string
}
export type InteractionHandler = (ctx: unknown, event: Interaction) => unknown
export interface Gateway {
  appId: string
  use: (...middleware: Middleware[]) => unknown
  start: (...args: unknown[]) => unknown
  on: (event: string, listener: InteractionHandler) => unknown
  off: (event: string, listener: InteractionHandler) => unknown
  send: (options: { target: Target, content?: string, markdown?: { content: string }, [key: string]: unknown }) => unknown
  sendText: (target: Target, content: string) => unknown
  sendTextWithKeyboard: (target: Target, content: string, keyboard?: unknown) => unknown
  sendImage: (target: Target, ...args: unknown[]) => unknown
  sendVideo: (target: Target, ...args: unknown[]) => unknown
  sendVoice: (target: Target, ...args: unknown[]) => unknown
  sendFile: (target: Target, ...args: unknown[]) => unknown
  acknowledgeInteraction: (id: string, code: number) => Promise<unknown>
}
export interface ToolRuntime {
  guard: (check: (execution: { agent?: object }) => string | undefined) => () => void
  restrict: (filter: { allow: string[] }) => () => void
}
export type ProtectedAgent = PeerRecord['agent'] & {
  ctx: { tools: ToolRuntime }
}
export interface SecurityManager extends ManagedQQ {
  config: {
    appId: string
    access: { c2cMode?: string, c2cAllow: string[], groupMode?: string, groupAllow?: string[] }
    requireMention?: boolean
    historyLimit?: number
    textChunkLimit?: number
    processingTimeoutMs?: number
  }
}
export interface AgentPayload { agent: object, turn: number, step: number }
export interface SecurityEvents {
  'system-prompt/assemble': (assembly: PromptAssembly, context: { agent?: object }, next: () => Promise<PromptAssembly>) => Promise<PromptAssembly>
  'agent/pre-step': (payload: AgentPayload, next: () => Promise<{ kind: string, [key: string]: unknown }>) => Promise<{ kind: string, [key: string]: unknown }>
  'agent/request': (payload: AgentPayload, next: () => Promise<{ maxTokens?: number, [key: string]: unknown }>) => Promise<{ maxTokens?: number, [key: string]: unknown }>
}
export interface SecurityContext {
  tools: ToolRuntime
  qqWorkspaceGrouping: { watchManager: (listener: (manager: SecurityManager) => void) => () => void }
  get: (name: string) => unknown
  provide: (name: string, service: unknown) => unknown
  on: <K extends keyof SecurityEvents>(name: K, listener: SecurityEvents[K], options?: { global?: boolean, prepend?: boolean }) => () => void
  effect: (install: () => (() => void), label?: string) => unknown
  loader?: { internal?: { import: (specifier: string, baseUrl: string, options: object) => Promise<unknown> } }
  baseUrl?: string
}
