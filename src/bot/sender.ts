import Bot from "./index";
import { MessageType, log } from "mirai-ts";
import * as Config from "../types/config";

export default class Sender {
  constructor(public bot: Bot) {}

  /**
   * 根据 QQ 号数组列表发送消息
   * @param messageChain
   * @param array qq 列表
   */
  sendFriendMessageByArray(
    messageChain: string | MessageType.MessageChain,
    array: number[],
    messageList: number[]
  ) {
    const mirai = this.bot.mirai;
    return Promise.all(
      array.map(async (qq) => {
        const { messageId } = await mirai.api.sendFriendMessage(
          messageChain,
          qq
        );
        messageList.push(messageId);
      })
    );
  }

  /**
   * 通过配置发送消息
   * @param messageChain
   * @param target
   */
  async sendMessageByConfig(
    messageChain: string | MessageType.MessageChain,
    target: Config.Target
  ): Promise<number[]> {
    const mirai = this.bot.mirai;
    const config = this.bot.el.config;
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
        await this.sendFriendMessageByArray(
          messageChain,
          config.master,
          messageList
        );
      }

      if (target.includes("admin")) {
        await this.sendFriendMessageByArray(
          messageChain,
          config.admin,
          messageList
        );
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
        await this.sendFriendMessageByArray(
          messageChain,
          target.friend,
          messageList
        );
      } catch (err) {
        log.error("发送失败：可能是由于 mirai 私聊暂不支持长文本");
      }
    }

    return messageList;
  }
}
