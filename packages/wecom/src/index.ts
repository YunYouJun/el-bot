export { WecomBridge } from './client'
export { loadWecomConfig } from './config'
export { inspectWecomMessage, isWecomDisconnect, normalizeWecomMessage } from './normalize'
export { replyOnWecom } from './reply'
export { WECOM_DEFAULT_WS_URL } from './types'
export type {
  IgnoredWecomMessage,
  WecomBridgeOptions,
  WecomChatType,
  WecomConfig,
  WecomIgnoreReason,
  WecomInboundPayload,
  WecomMessageDecision,
} from './types'

export { postWecomWebhook } from './webhook'
