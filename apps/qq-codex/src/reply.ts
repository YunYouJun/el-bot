import type { QQBotClient } from 'qq-sdk/official'
import type { ReplyCard, ReplyContext } from './types'
import { QQApiError } from 'qq-sdk/official'
import { FORMAT_REJECTIONS } from './constants'

/** Serialize each passive reply window and negotiate rich rendering without replaying ambiguous failures. */
export class ReplySender {
  private format: 'markdown' | 'markdown-only' | 'text'

  constructor(private qq: Pick<QQBotClient, 'reply'>, format: 'markdown' | 'text', private onError: (error: unknown) => void) {
    this.format = format
  }

  /** Queue a reply without blocking command admission; every HTTP attempt reserves a fresh sequence. */
  send(context: ReplyContext, message: string | ReplyCard): Promise<boolean> {
    const sent = (context.outbox ?? Promise.resolve(true)).then(() => this.deliver(context, message))
    context.outbox = sent
    return sent
  }

  private async deliver(context: ReplyContext, message: string | ReplyCard): Promise<boolean> {
    const text = typeof message === 'string' ? message : message.text
    while (context.sequence < 4 && Date.now() - Date.parse(context.message.timestamp) <= 60 * 60 * 1000) {
      const format = typeof message === 'string' ? 'text' : this.format
      const payload = typeof message === 'string' || format === 'text'
        ? text
        : format === 'markdown-only' ? { markdown: message.payload.markdown } : message.payload
      try {
        await this.qq.reply(context.message.author.user_openid, context.message.id, payload, ++context.sequence)
        return true
      }
      catch (error) {
        if (format !== 'text' && error instanceof QQApiError && [400, 403, 422].includes(error.status) && error.code !== undefined && FORMAT_REJECTIONS.has(error.code)) {
          // A concurrent window may already have selected text; do not upgrade it again.
          if (this.format !== 'text')
            this.format = format === 'markdown' && typeof payload !== 'string' && payload.keyboard ? 'markdown-only' : 'text'
          this.onError(new Error(`QQ 拒绝富文本格式 (${error.code})，已回退为${this.format === 'text' ? '纯文本' : '无按钮 Markdown'}。`))
          continue
        }
        this.onError(error)
        return false
      }
    }
    return false
  }
}
