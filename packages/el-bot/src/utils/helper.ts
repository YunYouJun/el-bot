import { MessageType } from "mirai-ts";

/**
 * 判断是否为 URL 链接
 * @param url
 */
export function isUrl(url: string) {
  return /^https?:\/\/.+/.test(url);
}

/**
 * 内部模式
 */
export class InnerMode {
  friendSet = new Set();
  groupSet = new Set();
  constructor(public msg?: MessageType.ChatMessage) {}

  setMsg(msg: MessageType.ChatMessage) {
    this.msg = msg;
  }

  /**
   * 进入
   */
  enter() {
    const msg = this.msg;
    if (!msg) return;
    if (msg.type === "FriendMessage") {
      this.friendSet.add(msg.sender.id);
    } else if (msg.type === "GroupMessage") {
      this.groupSet.add(msg.sender.group.id);
    }
  }

  /**
   * 当前状态
   * 是否已进入内部
   */
  getStatus() {
    const msg = this.msg;
    if (!msg) return;
    if (msg.type === "FriendMessage") {
      return this.friendSet.has(msg.sender.id);
    } else if (msg.type === "GroupMessage") {
      return this.groupSet.has(msg.sender.group.id);
    }
  }

  /**
   * 退出
   */
  exit() {
    const msg = this.msg;
    if (!msg) return;
    if (msg.type === "FriendMessage") {
      this.friendSet.delete(msg.sender.id);
    } else if (msg.type === "GroupMessage") {
      this.groupSet.delete(msg.sender.group.id);
    }
  }
}
