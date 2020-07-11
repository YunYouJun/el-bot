import { getListenStatusByConfig, sendMessageByConfig, AllMessageList } from "../utils/message";
import { Config, MessageType } from "mirai-ts";
import el from "../el";
import ElBot from "../bot";
import { bot } from "../../index";

interface ForwardConfig {
  listen: Config.Listen;
  target: Config.Target;
}

function recallByList(msg: MessageType.SingleMessage, messageList: any) {
  const mirai = bot.mirai;
  if (msg.authorId in messageList.friend) {
    messageList.friend[msg.authorId].map((messageId: number) => {
      mirai.api.recall(messageId);
    });
  }
  if (msg.group.id in messageList.group) {
    messageList.group[msg.group.id].map((messageId: number) => {
      mirai.api.recall(messageId);
    });
  }
}

export default function forward(ctx: ElBot) {
  const mirai = ctx.mirai;
  /**
   * 上一次发送的各消息 Id 列表
   */
  let lastMessageList: AllMessageList;
  mirai.on('message', async (msg: MessageType.SingleMessage) => {
    if (!msg.sender) return;

    const config = el.config;

    if (config.forward) {
      await Promise.all(config.forward.map(async (item: ForwardConfig) => {
        const canForward = getListenStatusByConfig(msg.sender, item);

        if (canForward) {
          // remove source
          lastMessageList = await sendMessageByConfig(msg.messageChain.slice(1), item.target);
        }
      }));
    }
  });

  // 消息撤回
  mirai.on('FriendRecallEvent', (msg: MessageType.SingleMessage) => {
    recallByList(msg, lastMessageList);
  });

  mirai.on('GroupRecallEvent', (msg: MessageType.SingleMessage) => {
    recallByList(msg, lastMessageList);
  });
}

forward.version = "0.0.1";
forward.description = "消息转发";
