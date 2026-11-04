/** Public WeCom smart-bot long-connection gateway. */
export const WECOM_DEFAULT_WS_URL = 'wss://openws.work.weixin.qq.com'

export type WecomBotType = 'smart' | 'webhook'
export type WecomChatType = 'dm' | 'group'

/**
 * Stable inbound payload for local handlers and optional webhook forwarding.
 * `sender.name` and `chat.id` are omitted when WeCom does not provide them.
 */
export interface WecomInboundPayload {
  source: 'wecom'
  text: string
  sender: {
    id: string
    name?: string
  }
  chat: {
    type: WecomChatType
    id?: string
  }
  msg: {
    id: string
  }
}

export type WecomIgnoreReason = 'unsupported-type' | 'empty-text' | 'non-user' | 'invalid'

export interface IgnoredWecomMessage {
  msgtype: string
  msgid?: string
  reason: WecomIgnoreReason
}

export type WecomMessageDecision
  = | { action: 'forward', payload: WecomInboundPayload }
    | { action: 'ignore', ignored: IgnoredWecomMessage }
    | { action: 'skip' }

export interface WecomSmartBotConfig {
  botType: 'smart'
  botId: string
  secret: string
  wsUrl: string
  /** Optional external forwarding destination, not a WeCom callback URL. */
  webhookUrl?: string
  webhookAuthHeader: string
  webhookAuthValue?: string
  heartbeatIntervalMs: number
}

export interface WecomWebhookBotConfig {
  botType: 'webhook'
  groupWebhookUrl: string
}

export type WecomConfig = WecomSmartBotConfig | WecomWebhookBotConfig

export type WecomGroupWebhookMessage
  = | { msgtype: 'text', text: { content: string } }
    | { msgtype: 'markdown', markdown: { content: string } }

export interface WecomBridgeOptions {
  botId: string
  secret: string
  /** Optional external forwarding destination. Omit to receive messages locally. */
  webhookUrl?: string
  webhookAuthValue?: string
  wsUrl?: string
  webhookAuthHeader?: string
  heartbeatIntervalMs?: number
  reconnectBaseMs?: number
  /** `-1` retries forever. `0` does not reconnect after the socket closes. */
  maxReconnectAttempts?: number
  subscribeTimeoutMs?: number
  webhookRetries?: number
  webhookRetryDelayMs?: number
  webhookTimeoutMs?: number
  fetchImpl?: typeof fetch
  onError?: (error: Error) => void
  onInbound?: (payload: WecomInboundPayload) => void
  onMessage?: (payload: WecomInboundPayload, context: { reply: (content: string) => Promise<unknown> }) => void | Promise<void>
  onIgnored?: (ignored: IgnoredWecomMessage) => void
  onReady?: () => void
  onDisconnect?: () => void
}
