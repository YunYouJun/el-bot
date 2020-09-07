import Bot from "src";
import { ObjectID, Collection } from "mongodb";
import Mirai from "mirai-ts";

/**
 * 用户的触发信息
 */
interface TriggerInfo {
  _id?: ObjectID;
  /**
   * 触发者 QQ
   */
  qq: number;
  /**
   * 总计触发次数
   */
  total: number;
  /**
   * 上次触发时间
   */
  lastTriggerTime: Date;
}

/**
 * 记录触发信息
 * @param mirai
 * @param collection
 */
async function recordTriggerInfo(mirai: Mirai, collection: Collection) {
  const analytics = collection;

  if (mirai.curMsg && mirai.curMsg.type === "GroupMessage") {
    const msg = mirai.curMsg;

    const res: TriggerInfo | null = await analytics.findOne({
      qq: msg.sender.id,
    });

    if (!res) {
      const triggerInfo: TriggerInfo = {
        qq: msg.sender.id,
        total: 1,
        lastTriggerTime: new Date(),
      };
      analytics.insertOne(triggerInfo);
    } else {
      analytics.updateOne(
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

  const { db, mirai } = bot;
  const analytics = db.collection("analytics");

  // 初始化 collection 结构
  if ((await analytics.find().count()) === 0) {
    analytics.createIndex(
      {
        qq: 1,
      },
      {
        unique: true,
      }
    );
    bot.logger.success("[analytics] 新建 Collection: analytics");
  }

  const sendGroupMessage = mirai.api.sendGroupMessage;
  // 重载消息发送函数
  mirai.api.sendGroupMessage = async (messageChain, target, quote) => {
    recordTriggerInfo(mirai, analytics);

    const data = await sendGroupMessage.apply(mirai.api, [
      messageChain,
      target,
      quote,
    ]);

    return data;
  };
}
