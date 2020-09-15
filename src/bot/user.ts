import Bot from ".";
import { check } from "mirai-ts";

export default class User {
  constructor(public bot: Bot) {}
  /**
   * 是否是主人
   * @param qq
   */
  isMaster(qq: number) {
    return this.bot.el.config.master.includes(qq);
  }

  /**
   * 是否是管理员
   * @param qq
   */
  isAdmin(qq: number) {
    return this.bot.el.config.admin.includes(qq);
  }

  /**
   * 是否拥有权限
   * @param qq 用户 QQ，若未传入，则取当前消息发送者
   * @param reply 是否回复
   * @param content 提示内容
   */
  isAllowed(qq = 0, reply = false, content = "您没有操作权限") {
    if (
      !qq &&
      this.bot.mirai.curMsg &&
      check.isChatMessage(this.bot.mirai.curMsg)
    ) {
      qq = this.bot.mirai.curMsg.sender.id;
    }

    const allowFlag = this.isMaster(qq) || this.isAdmin(qq);
    if (!allowFlag && reply) {
      this.bot.reply(content);
    }
    return allowFlag;
  }
}
