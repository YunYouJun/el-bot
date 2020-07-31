import { MessageType, log } from "mirai-ts";
import Bot from "../bot";

export interface LimitOptions {
  /**
   * 间隔
   */
  interval: number;
  /**
   * 数量
   */
  count: number;
  /**
   * 发送者
   */
  sender: {
    /**
     * 超过时间清空记录
     */
    interval: number;
    /**
     * 连续次数
     */
    maximum: number;
    /**
     * 提示
     */
    tooltip: string;
    /**
     * 禁言时间
     */
    time: number;
  };
}

interface GroupInfo {
  /**
   * 上一位发送者的 QQ
   */
  lastSenderId: number;
  /**
   * 发言次数
   */
  count: number;
}

interface GroupList {
  [propName: number]: GroupInfo;
}

export default function limit(ctx: Bot, options: LimitOptions) {
  const mirai = ctx.mirai;

  let count = 0;
  let startTime = new Date().getTime();
  let now = startTime;
  /**
   * 是否被限制
   */
  function isLimited() {
    now = new Date().getTime();
    if (now - startTime > options.interval) {
      count = 0;
      startTime = now;
    } else if (count >= options.count) {
      // 超过限定次数;
      return true;
    }
    return false;
  }

  /**
   * 发送者连续触发次数是否超过限额
   */
  let lastList: GroupList = {};
  async function isMaxCountForSender(bot: Bot): Promise<boolean> {
    if (!(mirai.curMsg && mirai.curMsg.type === "GroupMessage")) return false;
    const msg: MessageType.GroupMessage = mirai.curMsg as MessageType.GroupMessage;

    // 如果超过间隔时间，则重置历史记录
    now = new Date().getTime();
    if (now - startTime > options.sender.interval) {
      lastList = {};
    }

    if (lastList[msg.sender.group.id]) {
      if (lastList[msg.sender.group.id].lastSenderId === msg.sender.id) {
        lastList[msg.sender.group.id].count += 1;
      } else {
        lastList[msg.sender.group.id].lastSenderId = msg.sender.id;
        lastList[msg.sender.group.id].count = 1;
      }
    } else {
      lastList[msg.sender.group.id] = {
        lastSenderId: msg.sender.id,
        count: 1,
      };
    }

    // 同一个用户连续调用多次（不限制有机器人管理权限的人）
    if (
      lastList[msg.sender.group.id].count > options.sender.maximum &&
      !bot.user.isAllowed(msg.sender.id)
    ) {
      lastList[msg.sender.group.id].count = 0;
      await msg.reply(options.sender.tooltip);
      await mirai.api.mute(
        msg.sender.group.id,
        msg.sender.id,
        options.sender.time
      );
      return true;
    }
    return false;
  }

  const sendFriendMessage = mirai.api.sendFriendMessage;
  const sendGroupMessage = mirai.api.sendGroupMessage;

  mirai.api.sendFriendMessage = async (messageChain, target, quote) => {
    let data = {
      code: -1,
      msg: "fail",
      messageId: 0,
    };
    if (!isLimited()) {
      count += 1;
      data = await sendFriendMessage.apply(mirai.api, [
        messageChain,
        target,
        quote,
      ]);
      return data;
    } else {
      log.error("好友消息发送太频繁啦！");
    }
    return data;
  };

  mirai.api.sendGroupMessage = async (messageChain, target, quote) => {
    let data = {
      code: -1,
      msg: "fail",
      messageId: 0,
    };

    const isMax = await isMaxCountForSender(ctx);
    if (isMax) return data;

    if (!isLimited()) {
      count += 1;
      data = await sendGroupMessage.apply(mirai.api, [
        messageChain,
        target,
        quote,
      ]);
      return data;
    } else {
      log.error("群消息发送太频繁啦！");
    }
    return data;
  };
}

limit.version = "0.0.1";
limit.description = "限制消息频率";
