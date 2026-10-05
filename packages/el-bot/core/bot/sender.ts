import type { MessageType } from 'mirai-ts'
import type { Target } from '../../types/config'
import type { Bot } from './index'

export class Sender {
  constructor(public ctx: Bot) {}

  async sendMessageByConfig(message: string | MessageType.MessageChain, target: Target): Promise<number[]> {
    const api = this.ctx.mirai.api
    const results = await Promise.all([
      ...(target.friend ?? []).map(id => api.sendFriendMessage(message, id)),
      ...(target.group ?? []).map(id => api.sendGroupMessage(message, id)),
    ])
    return results.map(result => result.messageId)
  }
}
