import type { QQBotClient } from 'qq-sdk/official'
import type { CardImagePublished, CardImagePublisher, RemoteConfig, ReplyCard, ReplyContext } from './types'
import { QQApiError } from 'qq-sdk/official'
import { escapeMarkdown } from './cards'
import { FORMAT_REJECTIONS } from './constants'

/** Serialize each passive reply window and negotiate rich rendering without replaying ambiguous failures. */
export class ReplySender {
  private format: 'image' | 'image-only' | 'markdown' | 'markdown-only' | 'text'

  constructor(private qq: Pick<QQBotClient, 'reply'>, format: RemoteConfig['messageFormat'], private onError: (error: unknown) => void, private images?: CardImagePublisher) {
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
    let imagePayload: ReplyCard['payload'] | undefined
    let image: CardImagePublished | undefined
    while (context.sequence < 4 && Date.now() - Date.parse(context.message.timestamp) <= 60 * 60 * 1000) {
      // Native media needs a second message for copyable commands and working buttons.
      const skipImage = typeof message !== 'string' && (message.imageAllowed === false || (this.images?.kind === 'media' && context.sequence >= 3))
      const format = typeof message === 'string' ? 'text' : skipImage && this.format === 'image' ? 'markdown' : skipImage && this.format === 'image-only' ? 'markdown-only' : this.format
      if (typeof message !== 'string' && (format === 'image' || format === 'image-only') && !image) {
        try {
          if (!this.images)
            throw new Error('Image publisher is not configured')
          image = await this.images.publish(message, context.message.author.user_openid)
          if ('url' in image) {
            const footer = message.payload.markdown.content.split('\n\n***\n\n').at(-1) ?? ''
            const links = message.visual?.details.links?.map(link => `[${escapeMarkdown(link.label)}](${link.url})`).join(' · ')
            imagePayload = { ...message.payload, markdown: { content: [`![卡片 #${image.width}px #${image.height}px](${image.url})`, links, footer].filter(Boolean).join('\n\n'), force_verify_image_resource: true } }
          }
        }
        catch {
          if (this.format === 'image' || this.format === 'image-only')
            this.format = 'markdown'
          this.onError(new Error('图片渲染或上传未完成，已回退为 Markdown。'))
          continue
        }
        if (format !== this.format)
          continue
        // Rendering must not spend a passive reply after its window has expired.
        if (Date.now() - Date.parse(context.message.timestamp) > 60 * 60 * 1000)
          return false
      }
      if (typeof message !== 'string' && (format === 'image' || format === 'image-only') && image && 'media' in image) {
        if (context.sequence >= 3)
          return this.deliver(context, { ...message, imageAllowed: false })
        try {
          await this.qq.reply(context.message.author.user_openid, context.message.id, { media: image.media }, ++context.sequence)
        }
        catch (error) {
          if (error instanceof QQApiError && [400, 403, 422].includes(error.status) && error.code !== undefined && (FORMAT_REJECTIONS.has(error.code) || [304080, 40034004].includes(error.code))) {
            if (this.format === 'image' || this.format === 'image-only')
              this.format = 'markdown'
            this.onError(new Error('QQ 拒绝图片消息，已回退为 Markdown。'))
            continue
          }
          this.onError(error)
          return false
        }
        const footer = message.payload.markdown.content.split('\n\n***\n\n').at(-1) ?? ''
        const links = message.visual?.details.links?.map(link => `[${escapeMarkdown(link.label)}](${link.url})`).join(' · ')
        const title = message.visual?.title ?? '图片卡片'
        return this.deliver(context, {
          ...message,
          imageAllowed: false,
          text: [title, message.visual?.details.footnote ?? footer].join('\n\n'),
          payload: { ...message.payload, markdown: { content: [`**${escapeMarkdown(title)}**`, links, footer].filter(Boolean).join('\n\n') } },
        })
      }
      const rich = typeof message === 'string' ? undefined : (format === 'image' || format === 'image-only') ? imagePayload! : message.payload
      const payload = typeof message === 'string' || format === 'text'
        ? text
        : format === 'markdown-only' || format === 'image-only' ? { markdown: rich!.markdown } : rich!
      try {
        await this.qq.reply(context.message.author.user_openid, context.message.id, payload, ++context.sequence)
        return true
      }
      catch (error) {
        if ((format === 'image' || format === 'image-only') && error instanceof QQApiError && [400, 403, 422].includes(error.status) && [40034004, 40034141].includes(error.code ?? 0)) {
          // force_verify_image_resource rejects failed transfers before sending the message.
          if (this.format === 'image' || this.format === 'image-only')
            this.format = format === 'image' ? 'markdown' : 'markdown-only'
          this.onError(new Error('QQ 图片转存失败，已回退为 Markdown。'))
          continue
        }
        if (format !== 'text' && error instanceof QQApiError && [400, 403, 422].includes(error.status) && error.code !== undefined && FORMAT_REJECTIONS.has(error.code)) {
          // A concurrent window may already have selected text; do not upgrade it again.
          const next = format === 'image' ? 'image-only' : format === 'image-only' ? 'markdown-only' : format === 'markdown' && typeof payload !== 'string' && payload.keyboard ? 'markdown-only' : 'text'
          const order = ['image', 'image-only', 'markdown', 'markdown-only', 'text']
          if (order.indexOf(next) > order.indexOf(this.format))
            this.format = next
          this.onError(new Error(`QQ 拒绝富文本格式 (${error.code})，已切换为 ${this.format}。`))
          continue
        }
        this.onError(error)
        return false
      }
    }
    return false
  }
}
