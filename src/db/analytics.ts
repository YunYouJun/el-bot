import Bot from "src";
import Mirai from "mirai-ts";
import { User } from "./schemas/user.schema";

/**
 * 记录触发信息
 * @param mirai
 * @param collection
 */
async function recordTriggerInfo(mirai: Mirai) {
  if (mirai.curMsg && mirai.curMsg.type === "GroupMessage") {
    const msg = mirai.curMsg;

    const res = await User.findOne({
      qq: msg.sender.id,
    });

    if (!res) {
      const triggerInfo = new User({
        qq: msg.sender.id,
        total: 1,
        lastTriggerTime: new Date(),
      });
      triggerInfo.save();
    } else {
      User.updateOne(
        {
          qq: msg.sender.id,
        },
        {
          $inc: {
            total: 1,
          },
          $set: {
            lastTriggerTime: new Date(),
          },
        }
      );
    }
  }
}

/**
 * 分析统计
 * @param bot
 */
export async function analytics(bot: Bot) {
  if (!bot.db) {
    bot.logger.error("[analytics] 您必须先启用数据库。");
    return;
  }

  const { mirai } = bot;

  const sendGroupMessage = mirai.api.sendGroupMessage;
  // 重载消息发送函数
  mirai.api.sendGroupMessage = async (messageChain, target, quote) => {
    recordTriggerInfo(mirai);

    const data = await sendGroupMessage.apply(mirai.api, [
      messageChain,
      target,
      quote,
    ]);

    return data;
  };
}
