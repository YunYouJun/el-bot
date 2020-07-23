import ElBot from 'src/bot'
import log from 'mirai-ts/dist/utils/log'
import Mirai, { MessageType } from 'mirai-ts'
import Bot from 'src/bot'

let mirai: Mirai
let config: any

let count = 0
let startTime = new Date().getTime()
let now = startTime

function isLimited() {
  now = new Date().getTime()
  if (now - startTime > config.limit.interval) {
    count = 0
    startTime = now
  } else if (count >= config.limit.count) {
    // 超过限定次数;
    return true
  }
  return false
}

interface GroupInfo {
  /**
   * 上一位发送者的 QQ
   */
  lastSenderId: number
  /**
   * 发言次数
   */
  count: number
}

interface GroupList {
  [propName: number]: GroupInfo
}

let lastList: GroupList = {}

/**
 * 发送者连续触发次数是否超过限额
 */
async function isMaxCountForSender(bot: Bot): Promise<boolean> {
  if (!(mirai.curMsg && mirai.curMsg.type === 'GroupMessage')) return false
  const msg: MessageType.GroupMessage = mirai.curMsg as MessageType.GroupMessage

  // 如果超过间隔时间，则重置历史记录
  now = new Date().getTime()
  if (now - startTime > config.limit.sender.interval) {
    lastList = {}
  }

  if (lastList[msg.sender.group.id]) {
    if (lastList[msg.sender.group.id].lastSenderId === msg.sender.id) {
      lastList[msg.sender.group.id].count += 1
    } else {
      lastList[msg.sender.group.id].lastSenderId = msg.sender.id
      lastList[msg.sender.group.id].count = 1
    }
  } else {
    lastList[msg.sender.group.id] = {
      lastSenderId: msg.sender.id,
      count: 1,
    }
  }

  // 同一个用户连续调用多次（不限制有机器人管理权限的人）
  if (
    lastList[msg.sender.group.id].count > config.limit.sender.maximum &&
    !bot.user.isAllowed(msg.sender.id)
  ) {
    lastList[msg.sender.group.id].count = 0
    await msg.reply(config.limit.sender.tooltip)
    await mirai.api.mute(
      msg.sender.group.id,
      msg.sender.id,
      config.limit.sender.time
    )
    return true
  }
  return false
}

export default function limit(ctx: ElBot) {
  mirai = ctx.mirai
  config = ctx.el.config

  const sendFriendMessage = mirai.api.sendFriendMessage
  const sendGroupMessage = mirai.api.sendGroupMessage

  mirai.api.sendFriendMessage = async (messageChain, target, quote) => {
    let data = {
      code: -1,
      msg: 'fail',
      messageId: 0,
    }
    if (!isLimited()) {
      count += 1
      data = await sendFriendMessage.apply(mirai.api, [
        messageChain,
        target,
        quote,
      ])
      return data
    } else {
      log.error('好友消息发送太频繁啦！')
    }
    return data
  }

  mirai.api.sendGroupMessage = async (messageChain, target, quote) => {
    let data = {
      code: -1,
      msg: 'fail',
      messageId: 0,
    }

    const isMax = await isMaxCountForSender(ctx)
    if (isMax) return data

    if (!isLimited()) {
      count += 1
      data = await sendGroupMessage.apply(mirai.api, [
        messageChain,
        target,
        quote,
      ])
      return data
    } else {
      log.error('群消息发送太频繁啦！')
    }
    return data
  }
}

limit.version = '0.0.1'
limit.description = '限制消息频率'
