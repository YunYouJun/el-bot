import type { MessageType } from 'mirai-ts'
import type nodeSchdule from 'node-schedule'
import type * as Config from '../../types/config'
import axios from 'axios'
import { SendMessageSegment } from 'node-napcat-ts'
import { renderString } from '../../core/utils'

export type ReplyContent = string | SendMessageSegment[]

interface BaseAnswerOptions {
  /**
   * 监听
   */
  listen?: string | Config.ListenTarget
  /**
   * 不监听
   */
  unListen?: Config.ListenTarget
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

  /**
   * 是否命中 用于自定义判断
   * @example
   * ```ts
   * hit: (msg) => msg.raw_message === 'ping'
   * ```
   */
  hit?: (msg: string) => boolean

  /**
   * 接收到的文本 完全匹配 时回复
   * @example
   * ```ts
   * {
   *   receivedText: 'ping',
   *   reply: 'pong'
   * }
   */
  receivedText?: string[]
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

/**
 * @internal
 * @description Answer 插件配置
 * @example
 * ```ts
 * // el-bot.config.ts
 * import { answerPlugin, defineConfig } from 'el-bot'
 * export default defineConfig({
 *   bot: {
 *     plugins: [
 *       answerPlugin({
 *         list: []
 *       })
 *     ]
 *   },
 * })
 * ```
 */
export interface AnswerOptions {
  list: BaseAnswerOptions[]
}

/**
 * 输出回答列表
 */
export function displayAnswerList(options: AnswerOptions) {
  let content = '回答列表：'
  options.list.forEach((option) => {
    if (option.help)
      content += `\n- ${option.help}`
  })
  return content
}

/**
 * 根据 API 返回的内容渲染字符串
 * @param api
 * @param content
 */
export async function renderStringByApi(
  api: string,
  content: ReplyContent,
) {
  const { data } = await axios.get(api)
  if (typeof content === 'string') {
    return renderString(content, data, 'data')
  }
  else {
    if (!content)
      return
    (content as any).forEach((msg: MessageType.SingleMessage) => {
      if (msg.type === 'Plain')
        msg.text = renderString(msg.text, data, 'data')
    })
    return content
  }
}
