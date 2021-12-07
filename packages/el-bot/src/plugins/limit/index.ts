import Bot from 'el-bot'
import { LimitOptions } from './options'

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

export default function limit(ctx: Bot, options: LimitOptions) {
  const { mirai } = ctx

  let count = 0
  let startTime = new Date().getTime()
  let now = startTime

  /**
   * 是否被限制
   */
  function isLimited() {
    now = new Date().getTime()
    if (now - startTime > options.interval) {
      count = 0
      startTime = now
    }
    return count > options.count
  }

  /**
   * 发送者连续触发次数是否超过限额
   */
  let lastList: GroupList = {}
  async function isMaxCountForSender(): Promise<boolean> {
    let msg
    if (mirai.curMsg && mirai.curMsg.type === 'GroupMessage')
      msg = mirai.curMsg
    else
      return false

    // 如果超过间隔时间，则重置历史记录
    now = new Date().getTime()
    if (now - startTime > options.sender.interval)
      lastList = {}

    const senderId = msg.sender.id
    const groupId = msg.sender.group.id
    if (lastList[groupId]) {
      if (lastList[groupId].lastSenderId === senderId) {
        lastList[groupId].count += 1
      }
      else {
        lastList[groupId].lastSenderId = senderId
        lastList[groupId].count = 1
      }
    }
    else {
      lastList[groupId] = {
        lastSenderId: senderId,
        count: 1,
      }
    }

    // 同一个用户连续调用多次（不限制有机器人管理权限的人）
    if (
      lastList[groupId].count > options.sender.maximum
      && !ctx.user.isAllowed(senderId)
    ) {
      lastList[groupId].count = 0

      await msg.reply(options.sender.tooltip)
      await mirai.api.mute(groupId, senderId, options.sender.time)
      return true
    }
    return false
  }

  // 只限制群消息
  const sendGroupMessage = mirai.api.sendGroupMessage

  mirai.api.sendGroupMessage = async(messageChain, target, quote) => {
    let data = {
      code: -1,
      msg: 'fail',
      messageId: 0,
    }

    const isMax = await isMaxCountForSender()
    if (isMax) return data

    if (!isLimited()) {
      count += 1
      data = await sendGroupMessage.apply(mirai.api, [
        messageChain,
        target,
        quote,
      ])
      return data
    }
    else {
      ctx.logger.error('[limit] 群消息发送太频繁啦！')
    }
    return data
  }
}
