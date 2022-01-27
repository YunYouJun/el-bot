import type { MessageType, check } from 'mirai-ts'
import type nodeSchdule from 'node-schedule'
import type * as Config from '../../types/config'

export type ReplyContent= string | Partial<MessageType.SingleMessage>[]

interface BaseAnswerOptions extends check.Match {
  /**
   * 监听
   */
  listen?: string | Config.Listen
  /**
   * 不监听
   */
  unlisten?: Config.Listen
  /**
   * 定时任务
   */
  cron?: nodeSchdule.RecurrenceRule
  /**
   * 定时发送的对象
   */
  target?: Config.Target
  /**
   * API 地址，存在时，自动渲染字符串
   */
  api?: string
  reply: ReplyContent
  /**
   * 只有被 @ 时回复
   */
  at?: boolean
  /**
   * 回复时是否引用消息
   */
  quote?: boolean
  else?: ReplyContent
  /**
   * 帮助信息
   */
  help?: string
}

export type AnswerOptions = BaseAnswerOptions[]

/**
 * 输出回答列表
 */
export function displayAnswerList(options: AnswerOptions) {
  let content = '回答列表：'
  options.forEach((option) => {
    if (option.help)
      content += `\n- ${option.help}`
  })
  return content
}
