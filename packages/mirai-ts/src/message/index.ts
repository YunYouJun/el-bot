import MiraiApiHttp from "../mirai-api-http";
import MessageType from "../../types/message-type";

export default class Message {
  msg: MessageType.Message;
  mah: MiraiApiHttp;
  constructor(msg: MessageType.Message, mah: MiraiApiHttp) {
    this.msg = msg;
    this.mah = mah;
  }

  reply() {
    const target = this.msg.sender.id;
    if (this.msg.type === 'FriendMessage') {
      return this.mah.sendFriendMessage(target, this.msg.messageChain);
    } else if (this.msg.type === 'GroupMessage') {
      return this.mah.sendGroupMessage(target, this.msg.messageChain);
    }
  }
}
