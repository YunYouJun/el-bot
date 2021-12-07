import Bot from 'el-bot'
import Mirai, { MessageType, EventType } from 'mirai-ts'
import * as Config from '../../types/config'

interface ForwardItem {
  listen: Config.Listen
  target: Config.Target
}

export type ForwardOptions = ForwardItem[]

interface AllMessageList {
  [propName: number]: number[]
}

/**
 * 撤回消息对应转发群中的消息
 * @param mirai
 * @param msg
 * @param allMessageList
 */
function recallByList(
  mirai: Mirai,
  msg: EventType.FriendRecallEvent | EventType.GroupRecallEvent,
  allMessageList: AllMessageList,
) {
  if (allMessageList && msg.messageId in allMessageList) {
    allMessageList[msg.messageId].map((messageId: number) => {
      mirai.api.recall(messageId)
    })
    allMessageList[msg.messageId] = []
  }
}

export default function(ctx: Bot, options: ForwardOptions) {
  const mirai = ctx.mirai
  /**
   * 原消息和被转发的各消息 Id 关系列表
   */
  const allMessageList: AllMessageList = {}
  mirai.on('message', async(msg: MessageType.ChatMessage) => {
    if (!msg.sender || !msg.messageChain) return

    if (options) {
      await Promise.all(
        options.map(async(item: ForwardItem) => {
          const canForward = ctx.status.getListenStatusByConfig(
            msg.sender,
            item,
          )

          if (canForward) {
            // remove source
            const sourceMessageId: number = msg.messageChain[0].id
            allMessageList[
              sourceMessageId
            ] = await ctx.sender.sendMessageByConfig(
              msg.messageChain.slice(1),
              item.target,
            )
          }
        }),
      )
    }
  })

  // 消息撤回
  mirai.on('FriendRecallEvent', (msg: EventType.FriendRecallEvent) => {
    recallByList(mirai, msg, allMessageList)
  })

  mirai.on('GroupRecallEvent', (msg: EventType.GroupRecallEvent) => {
    recallByList(mirai, msg, allMessageList)
  })
}
