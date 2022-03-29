import type { MessageType } from 'mirai-ts'
import { Message, template } from 'mirai-ts'

export function card(msg: MessageType.ChatMessage) {
  if (msg.plain === '卡片') {
    msg.reply([
      Message.Xml(
        template.card({
          type: 'bilibili',
          url: 'https://www.bilibili.com/video/BV1bs411b7aE',
          cover:
            'https://cdn.jsdelivr.net/gh/YunYouJun/cdn/img/meme/love-er-ci-yuan-is-sick.jpg',
          summary: '咱是摘要',
          title: '咱是标题',
          brief: '咱是简介',
        }),
      ),
    ])
  }
}
