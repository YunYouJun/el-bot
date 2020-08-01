import Mirai, { MessageType, EventType } from "mirai-ts";
import ElBot from "../bot";
import * as Config from "../types/config";

interface ForwardConfig {
  listen: Config.Listen;
  target: Config.Target;
}

interface AllMessageList {
  [propName: number]: number[];
}

/**
 * 撤回消息对应转发群中的消息
 * @param mirai
 * @param msg
 * @param allMessageList
 */
function recallByList(
  mirai: Mirai,
  msg: EventType.FriendRecallEvent | EventType.GroupRecallEvent,
  allMessageList: AllMessageList
) {
  if (allMessageList && msg.messageId in allMessageList) {
    allMessageList[msg.messageId].map((messageId: number) => {
      mirai.api.recall(messageId);
    });
    allMessageList[msg.messageId] = [];
  }
}

export default function forward(ctx: ElBot) {
  const mirai = ctx.mirai;
  const config = ctx.el.config;
  /**
   * 原消息和被转发的各消息 Id 关系列表
   */
  const allMessageList: AllMessageList = {};
  mirai.on("message", async (msg: MessageType.ChatMessage) => {
    if (!msg.sender || !msg.messageChain) return;

    if (config.forward) {
      await Promise.all(
        config.forward.map(async (item: ForwardConfig) => {
          const canForward = ctx.status.getListenStatusByConfig(
            msg.sender,
            item
          );

          if (canForward) {
            // remove source
            const sourceMessageId: number = msg.messageChain[0].id;
            allMessageList[
              sourceMessageId
            ] = await ctx.sender.sendMessageByConfig(
              msg.messageChain.slice(1),
              item.target
            );
          }
        })
      );
    }
  });

  // 消息撤回
  mirai.on("FriendRecallEvent", (msg: EventType.FriendRecallEvent) => {
    recallByList(mirai, msg, allMessageList);
  });

  mirai.on("GroupRecallEvent", (msg: EventType.GroupRecallEvent) => {
    recallByList(mirai, msg, allMessageList);
  });
}

forward.version = "0.0.1";
forward.description = "消息转发";
