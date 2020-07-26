import Bot from ".";
import { Contact, Config } from "mirai-ts";

type BaseListenType = "all" | "master" | "admin" | "friend" | "group";

export default class Status {
  constructor(public bot: Bot) {}

  /**
   * 是否监听发送者
   * @param {Object} sender
   */
  isListening(sender: Contact.User, listen: BaseListenType | Config.Listen) {
    if (typeof listen === "string") {
      let listenFlag = false;
      switch (listen as BaseListenType) {
        // 监听所有
        case "all":
          listenFlag = true;
          break;

        // 监听 master
        case "master":
          listenFlag = this.bot.user.isMaster(sender.id);
          break;

        // 监听管理员
        case "admin":
          listenFlag = this.bot.user.isAdmin(sender.id);
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

        if (listen.includes("master") && this.bot.user.isMaster(sender.id)) {
          return true;
        }

        if (listen.includes("admin") && this.bot.user.isAdmin(sender.id)) {
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
   * 从配置直接获取监听状态（包括判断 listen 与 unlisten）
   * @param sender 发送者
   * @param config 配置
   */
  getListenStatusByConfig(sender: Contact.User, config: any): boolean {
    let listenFlag = true;
    if (config.listen) {
      listenFlag = this.isListening(sender, config.listen || "all");
    } else if (config.unlisten) {
      listenFlag = !this.isListening(sender, config.unlisten || "all");
    }
    return listenFlag;
  }
}
