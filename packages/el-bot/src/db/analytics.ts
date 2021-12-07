import Bot from 'el-bot'
import Mirai from 'mirai-ts'
import { Friend } from './schemas/friend.schema'

/**
 * 记录触发信息
 * @param mirai
 * @param collection
 */
async function recordTriggerInfo(mirai: Mirai) {
  if (mirai.curMsg && mirai.curMsg.type === 'GroupMessage') {
    const msg = mirai.curMsg

    Friend.findOneAndUpdate(
      {
        qq: msg.sender.id,
        lastTriggerTime: new Date(),
      },
      {
        $inc: {
          total: 1,
        },
        $setOnInsert: {
          total: 0,
        },
      },
      {
        upsert: true,
      },
    )
  }
}

/**
 * 分析统计
 * @param bot
 */
export async function analytics(bot: Bot) {
  if (!bot.db) {
    bot.logger.error('[analytics] 您必须先启用数据库。')
    return
  }

  const { mirai } = bot

  const sendGroupMessage = mirai.api.sendGroupMessage
  // 重载消息发送函数
  mirai.api.sendGroupMessage = async(messageChain, target, quote) => {
    recordTriggerInfo(mirai)

    const data = await sendGroupMessage.apply(mirai.api, [
      messageChain,
      target,
      quote,
    ])

    return data
  }
}
