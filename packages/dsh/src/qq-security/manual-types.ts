export type SendMode = 'proactive' | 'reply'
export interface ManualTarget { id: string, scope: 'c2c' | 'group', peerId: string, sessionId: string, title: string }
export interface Lease { id: string, expiresAt: number, phase: 'pausing' | 'active' }
export interface Delivery {
  id: string
  target: string
  textHash: string
  mode: SendMode
  status: 'pending' | 'sent' | 'failed' | 'unknown'
  createdAt: number
  messageId?: string
  code?: string
}
export interface ManualSession extends Omit<ManualTarget, 'peerId'> {
  lease?: Lease
  replyAvailable: boolean
  proactivePermission: 'unknown' | 'allowed' | 'denied'
  recent: { text: string, receivedAt: number }[]
}
export interface ManualStateView {
  now: number
  online: boolean
  sessions: ManualSession[]
  deliveries: Delivery[]
}
export interface ManualPreview {
  id: string
  target: string
  title: string
  scope: 'c2c' | 'group'
  text: string
  mode: SendMode
  expiresAt: number
}
export type ManualRequest
  = | { operation: 'list' }
    | { operation: 'begin', target: string, seconds?: number }
    | { operation: 'end', target: string, lease: string }
    | { operation: 'preview', target: string, lease: string, text: string, mode: SendMode }
    | { operation: 'send', preview: string }

export class ManualError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}

export const manualErrors: Record<string, string> = {
  unavailable: '机器人尚未连接，请稍后刷新。',
  not_found: '会话不在当前白名单中，请刷新后重试。',
  invalid_request: '请求无效，请刷新后重试。',
  invalid_text: '请输入 1–1200 字符的原文；发送时不会改写或截断。',
  invalid_duration: '接管时长应在 30 秒到 30 分钟之间。',
  lease_expired: '接管已结束或超时，自动回复已恢复。',
  still_pausing: '正在等待当前任务和在途回复结束，请稍后刷新。',
  preview_expired: '预览已失效，请重新预览后发送。',
  stale_session: '会话已切换，请刷新并重新预览。',
  reply_expired: '最近消息已过回复时限或次数上限。可等待新消息，或明确选择主动发送。',
  rate_limited: '已达到发送限额，请稍后重试。',
  send_in_progress: '还有一条消息正在发送，请等待回执后结束接管。',
  proactive_denied: 'QQ 拒绝主动发送，请检查该会话的“允许主动发送”设置和机器人权限。',
  platform_rejected: 'QQ 拒绝了这条消息；请核对平台错误码后重新预览。',
  delivery_unknown: '发送结果未知，请先到 QQ 确认，避免重复发送。',
  journal_unavailable: '接管记录不可读或不可写，已停止操作，请在服务端检查。',
}
