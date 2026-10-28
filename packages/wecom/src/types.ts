/** Public WeCom 智能机器人 long-connection gateway. */
export const WECOM_DEFAULT_WS_URL = 'wss://openws.work.weixin.qq.com'

export type WecomChatType = 'dm' | 'group'

/**
 * Stable inbound payload posted to the Grok webhook.
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

export interface WecomConfig {
  botId: string
  secret: string
  wsUrl: string
  webhookUrl: string
  webhookAuthHeader: string
  webhookAuthValue: string
  heartbeatIntervalMs: number
}

export interface WecomBridgeOptions {
  botId: string
  secret: string
  webhookUrl: string
  webhookAuthValue: string
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
  onIgnored?: (ignored: IgnoredWecomMessage) => void
  onReady?: () => void
  onDisconnect?: () => void
}
