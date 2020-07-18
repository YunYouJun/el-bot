import { Contact, MessageType, Config } from "mirai-ts";
import { el, bot } from "../../index";
import { isMaster, isAdmin } from "./global";
import log from "mirai-ts/dist/utils/log";

type BaseListenType = "all" | "master" | "admin" | "friend" | "group";

/**
 * 是否监听发送者
 * @param {Object} sender
 */
function isListening(
  sender: Contact.User,
  listen: BaseListenType | Config.Listen
) {
  if (typeof listen === "string") {
    let listenFlag = false;
    switch (listen as BaseListenType) {
      // 监听所有
      case "all":
        listenFlag = true;
        break;

      // 监听 master
      case "master":
        listenFlag = isMaster(sender.id);
        break;

      // 监听管理员
      case "admin":
        listenFlag = isAdmin(sender.id);
        break;

      // 只监听好友
      case "friend":
        // 群不存在
        listenFlag = !(sender as Contact.Member).group;
        break;

      // 监听群
      case "group":
        // 群存在
        listenFlag = Boolean((sender as Contact.Member).group);
        break;

      default:
        break;
    }

    return listenFlag;
  } else {
    // 语法糖
    if (Array.isArray(listen)) {
      // 无论 QQ 号还是 QQ 群号
      if (
        listen.includes(sender.id) ||
        ((sender as Contact.Member).group &&
          listen.includes((sender as Contact.Member).group.id))
      )
        return true;

      if (listen.includes("master") && isMaster(sender.id)) {
        return true;
      }

      if (listen.includes("admin") && isAdmin(sender.id)) {
        return true;
      }

      // 只监听好友
      if (listen.includes("friend") && !(sender as Contact.Member).group) {
        return true;
      }

      if (listen.includes("group") && (sender as Contact.Member).group) {
        return true;
      }
    }

    // 指定 QQ
    if (listen.friend && listen.friend.includes(sender.id)) {
      return true;
    }

    if ((sender as Contact.Member).group) {
      // 群
      if (
        listen.group &&
        listen.group.includes((sender as Contact.Member).group.id)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 根据 QQ 号数组列表发送消息
 * @param messageChain
 * @param array qq 列表
 */
function sendFriendMessageByArray(
  messageChain: string | MessageType.MessageChain,
  array: number[],
  messageList: number[]
) {
  const mirai = bot.mirai;
  return Promise.all(
    array.map(async (qq) => {
      const { messageId } = await mirai.api.sendFriendMessage(messageChain, qq);
      messageList.push(messageId);
    })
  );
}

/**
 * 通过配置发送消息
 * @param messageChain 
 * @param target 
 */
async function sendMessageByConfig(
  messageChain: string | MessageType.MessageChain,
  target: Config.Target
): Promise<number[]> {
  const mirai = bot.mirai;
  const config = el.config;
  const messageList: number[] = [];

  if (Array.isArray(messageChain)) {
    messageChain.forEach((msg) => {
      if (msg.type === "Image") {
        delete msg.imageId;
      }
    });
  }

  if (Array.isArray(target) || typeof target === "string") {
    if (target.includes("master")) {
      await sendFriendMessageByArray(messageChain, config.master, messageList);
    }

    if (target.includes("admin")) {
      await sendFriendMessageByArray(messageChain, config.admin, messageList);
    }
  }

  if (target.group) {
    await Promise.all(
      target.group.map(async (qq: number) => {
        const { messageId } = await mirai.api.sendGroupMessage(
          messageChain,
          qq
        );
        messageList.push(messageId);
      })
    );
  }

  if (target.friend) {
    try {
      await sendFriendMessageByArray(messageChain, target.friend, messageList);
    } catch (err) {
      log.error("发送失败：可能是由于 mirai 私聊暂不支持长文本");
    }
  }

  return messageList;
}

/**
 * 渲染 ES6 字符串
 * @param template 字符串模版
 * @param data 数据
 * @param name 参数名称
 */
function renderString(template: string, data: string | object, name: string) {
  return Function(name, "return `" + template + "`")(data);
}

/**
 * 从配置直接获取监听状态（包括判断 listen 与 unlisten）
 * @param sender 发送者
 * @param config 配置
 */
function getListenStatusByConfig(sender: Contact.User, config: any): boolean {
  let listenFlag = true;
  if (config.listen) {
    listenFlag = isListening(sender, config.listen || "all");
  } else if (config.unlisten) {
    listenFlag = !isListening(sender, config.unlisten || "all");
  }
  return listenFlag;
}

export {
  isListening,
  renderString,
  sendMessageByConfig,
  getListenStatusByConfig,
};
