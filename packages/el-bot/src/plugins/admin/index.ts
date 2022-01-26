import type { EventType } from 'mirai-ts'
import { Message } from 'mirai-ts'
import type { Bot } from 'el-bot'

export default function(ctx: Bot) {
  const { mirai } = ctx
  const masters = ctx.el.bot.master

  const messageListMap = new Map<
  number,
  EventType.BotInvitedJoinGroupRequestEvent
  >()

  mirai.on('BotInvitedJoinGroupRequestEvent', (msg) => {
    const content = [
      Message.Plain(
        `好友 ${msg.nick}(${msg.fromId}) 邀请您加入 ${msg.groupName}(${msg.groupId})\n引用回复该信息，0 同意邀请，1 拒绝邀请`,
      ),
    ]

    masters.forEach(async(target) => {
      const { messageId } = await mirai.api.sendFriendMessage(content, target)
      messageListMap.set(messageId, msg)
    })
  })

  mirai.on('FriendMessage', (msg) => {
    const quoteMsg = msg.get('Quote')
    if (quoteMsg && messageListMap.get(quoteMsg.id))
      messageListMap.get(quoteMsg.id)?.respond(parseInt(msg.plain))
  })
}
