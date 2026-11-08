import type { ManualTarget } from './manual-types'

export type ScheduleKind = 'text' | 'summary' | 'digest'
export type ScheduleRunStatus = 'sent' | 'failed' | 'unknown' | 'offline'

export interface ScheduleTask {
  id: string
  target: string
  title: string
  kind: ScheduleKind
  time: string
  days: number[]
  enabled: boolean
  text?: string
  windowHours: number
  maxMessages: number
  createdAt: number
  updatedAt: number
  lastRunKey?: string
  lastRunAt?: number
  lastStatus?: ScheduleRunStatus
  lastCode?: string
}

export interface ScheduleRun {
  id: string
  taskId: string
  status: ScheduleRunStatus
  createdAt: number
  messageId?: string
  code?: string
}

export interface ScheduleTaskView extends ScheduleTask {
  nextRunAt?: number
}

export interface ScheduleModel {
  provider: string
  model: string
  reasoningEffort?: string
}

export interface ScheduleStateView {
  now: number
  online: boolean
  timezone: string
  targets: { id: string, title: string, sessionId: string, model?: ScheduleModel }[]
  tasks: ScheduleTaskView[]
  runs: ScheduleRun[]
  summaryModel?: ScheduleModel
}

export interface ScheduleDraft {
  target?: string
  kind?: ScheduleKind
  time?: string
  days?: number[]
  enabled?: boolean
  text?: string
  windowHours?: number
  maxMessages?: number
}

export type ScheduleRequest
  = | { operation: 'list' }
    | ({ operation: 'create' } & ScheduleDraft)
    | ({ operation: 'update', id: string } & ScheduleDraft)
    | { operation: 'delete', id: string }
    | { operation: 'run', id: string }
    | { operation: 'preview', id: string }

export interface ScheduleTarget extends ManualTarget {}

export interface ScheduleMessage {
  text: string
  senderName?: string
  senderId?: string
  createdAt: string
}

export interface ScheduleBridge {
  online: () => boolean
  targets: () => Promise<ManualTarget[]>
  model: (target: ManualTarget) => ScheduleModel | undefined
  recent: (target: ManualTarget, since: number, until: number, maxMessages: number) => Promise<ScheduleMessage[]>
  send: (target: ManualTarget, text: string) => Promise<{ id?: string }>
}

export interface ScheduleLlm {
  stream: (options: {
    provider: string
    model: string
    reasoningEffort?: string
    messages: { role: 'user', content: { type: 'text', text: string }[] }[]
    system?: string
    maxTokens?: number
    signal?: AbortSignal
  }) => AsyncIterable<{
    type: string
    text?: string
    reason?: { kind?: string, failure?: { code?: string, message?: string } }
  }>
}

export class ScheduleError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

export const scheduleErrors: Record<string, string> = {
  unavailable: '机器人尚未连接，定时任务会在连接恢复后继续。',
  invalid_request: '定时任务请求无效，请刷新后重试。',
  invalid_target: '请选择一个当前可用的 QQ 群。',
  invalid_time: '时间应为 HH:mm，星期为 1–7（周一至周日）。',
  invalid_text: '固定文本应为 1–1200 字符。',
  invalid_window: '统计窗口应在 1–168 小时之间，消息上限为 20–500 条。',
  task_not_found: '定时任务不存在或已删除。',
  task_limit: '每个实例最多配置 24 个定时任务。',
  group_limit: '每个群最多配置 4 个定时任务。',
  model_unavailable: '该群尚未选择模型，无法生成群聊总结。请先在群会话中选择模型。',
  summary_empty: '统计窗口内没有可总结的群消息，本次不发送。',
  summary_failed: '群聊总结生成失败，本次不发送。',
  send_failed: 'QQ 拒绝了定时消息，请检查群内的主动发送权限。',
  rate_limited: '操作过于频繁或已达到发送限额，请稍后再试。',
  journal_unavailable: '定时任务记录不可读或不可写，已停止发送。',
}
