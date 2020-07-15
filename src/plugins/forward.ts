import { getListenStatusByConfig, sendMessageByConfig } from "../utils/message";
import { Config, MessageType, EventType } from "mirai-ts";
import el from "../el";
import ElBot from "../bot";
import { bot } from "../../index";

interface ForwardConfig {
  listen: Config.Listen;
  target: Config.Target;
}

interface AllMessageList {
  [propName: number]: number[];
}

function recallByList(msg: EventType.FriendRecallEvent | EventType.GroupRecallEvent, messageList: AllMessageList) {
  const mirai = bot.mirai;
  if (messageList && msg.messageId in messageList) {
    messageList[msg.messageId].map((messageId: number) => {
      mirai.api.recall(messageId);
    });
    messageList[msg.messageId] = [];
  }
}

export default function forward(ctx: ElBot) {
  const mirai = ctx.mirai;
  /**
   * 原消息和被转发的各消息 Id 关系列表
   */
  let allMessageList: AllMessageList = {};
  mirai.on('message', async (msg: MessageType.ChatMessage) => {
    if (!msg.sender || !msg.messageChain) return;

    const config = el.config;

    if (config.forward) {
      await Promise.all(config.forward.map(async (item: ForwardConfig) => {
        const canForward = getListenStatusByConfig(msg.sender, item);

        if (canForward) {
          // remove source
          let sourceMessageId: number = msg.messageChain[0].id;
          allMessageList[sourceMessageId] = await sendMessageByConfig(msg.messageChain.slice(1), item.target);
        }
      }));
    }
  });

  // 消息撤回
  mirai.on('FriendRecallEvent', (msg: EventType.FriendRecallEvent) => {
    recallByList(msg, allMessageList);
  });

  mirai.on('GroupRecallEvent', (msg: EventType.GroupRecallEvent) => {
    recallByList(msg, allMessageList);
  });
}

forward.version = "0.0.1";
forward.description = "消息转发";
