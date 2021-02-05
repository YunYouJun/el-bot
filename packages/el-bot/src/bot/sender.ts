import Bot from "./index";
import { MessageType } from "mirai-ts";
import * as Config from "../types/config";

export default class Sender {
  constructor(public ctx: Bot) {}

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
    const mirai = this.ctx.mirai;
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
    const mirai = this.ctx.mirai;
    const botConfig = this.ctx.el.bot;
    const messageList: number[] = [];

    if (Array.isArray(messageChain)) {
      messageChain.forEach((msg) => {
        if (msg.type === "Image") {
          msg.imageId = "";
        }
      });
    }

    if (Array.isArray(target) || typeof target === "string") {
      if (target.includes("master")) {
        await this.sendFriendMessageByArray(
          messageChain,
          botConfig.master,
          messageList
        );
      }

      if (target.includes("admin") && botConfig.admin) {
        await this.sendFriendMessageByArray(
          messageChain,
          botConfig.admin,
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
        this.ctx.logger.error("发送失败：可能是由于 mirai 私聊暂不支持长文本");
      }
    }

    return messageList;
  }
}
