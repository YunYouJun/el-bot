import type { QQBotClient } from 'qq-sdk/official'
import type { CardImagePublisher, ImageOptions, ReplyCard } from './types'
import { renderCardImage } from './image'

/** Uploaded file info goes directly to a native media reply, without Markdown transfer. */
export class CardImageUploader implements CardImagePublisher {
  readonly kind = 'media' as const
  constructor(private qq: Pick<QQBotClient, 'uploadImage'>, private options: ImageOptions, private render = renderCardImage) {}

  async publish(card: ReplyCard, openId: string) {
    const image = await this.render(card, this.options)
    const uploaded = await this.qq.uploadImage(openId, image.png, 'card.png')
    return { media: { file_info: uploaded.file_info }, width: image.width, height: image.height }
  }
}
