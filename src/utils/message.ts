import { MessageType } from "mirai-ts";
import { el, bot } from "../../index";
import { Config } from "mirai-ts";

/**
 * 是否监听发送者
 * @param {Object} sender
 */
function isListening(sender: MessageType.Sender, listen: string | Config.Listen) {
  const config = el.config;

  if (typeof listen === 'string') {

    // 监听所有
    if (listen === "all") {
      return true;
    }

    // 监听 master
    if (listen === "master" && config.master.includes(sender.id)) {
      return true;
    }

    // 监听管理员
    if (listen === "admin" && config.admin.includes(sender.id)) {
      return true;
    }

  } else {

    // 指定 QQ
    if (listen.friend && listen.friend.includes(sender.id)) {
      return true;
    }

    if (sender.group) {
      // 群
      if (
        listen === "group" ||
        (listen.group && listen.group.includes(sender.group.id))
      ) {
        return true;
      }
    } else {
      // 私聊时，判断是否监听 friend（其余在上方指定 QQ 时已判断过）
      if (listen === "friend") {
        return true;
      }
    }
  }

  return false;
}

interface MessageList {
  [propName: number]: number[];
}

export interface AllMessageList {
  friend: MessageList;
  group: MessageList;
}

/**
 * 通过配置发送消息
 * @param {MessageChain} messageChain
 * @param {object} target
 */

async function sendMessageByConfig(
  messageChain: string | MessageType.MessageChain,
  target: Config.Target
) {
  const mirai = bot.mirai;
  let messageList: AllMessageList = {
    friend: {},
    group: {}
  };

  if (Array.isArray(messageChain)) {
    messageChain.forEach(msg => {
      if (msg.type === "Image") {
        delete msg.imageId;
      }
    });
  }

  if (target.friend) {
    await Promise.all(target.friend.map(async (qq) => {
      const { messageId } = await mirai.api.sendFriendMessage(messageChain, qq);
      if (!messageList.friend[qq]) {
        messageList.friend[qq] = [];
      }
      messageList.friend[qq].push(messageId);
    }));
  }

  if (target.group) {
    await Promise.all(target.group.map(async (qq) => {
      const { messageId } = await mirai.api.sendGroupMessage(messageChain, qq);
      if (!messageList.group[qq]) {
        messageList.group[qq] = [];
      }
      messageList.group[qq].push(messageId);
    }));
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
function getListenStatusByConfig(sender: MessageType.Sender, config: any): boolean {
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
