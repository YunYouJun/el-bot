import axios from "./axios";
import { AxiosStatic } from "axios";
import MiraiApiHttp from "./mirai-api-http";
import { MiraiApiHttpConfig } from "./mirai-api-http";
import { MessageType } from "..";
import Message from "./message";

declare module ".." {
  namespace MessageType {
    interface Message {
      /**
       * 回复消息
       * @param msg 消息内容
       * @param quote 是否引用
       */
      reply(msg: MessageType.MessageChain | string, quote?: boolean): void;
    }
  }
}


/**
 * Mirai SDK 初始化类
 */
export default class Mirai {
  /**
   * 封装 mirai-api-http 的固有方法
   */
  api: MiraiApiHttp;
  mahConfig: MiraiApiHttpConfig;
  /**
   * 请求工具
   */
  axios: AxiosStatic;
  /**
   * sessionKey 是使用以下方法必须携带的 sessionKey 使用前必须进行校验和绑定指定的Bot，每个 Session 只能绑定一个 Bot，但一个 Bot 可有多个Session。
   * sessionKey 在未进行校验的情况下，一定时间后将会被自动释放。
   */
  sessionKey: string;
  /**
   * 拉起消息时间间隔，默认 200 ms
   */
  interval: number;
  qq: number;
  /**
   * 是否验证成功
   */
  verified: boolean;
  constructor(mahConfig: MiraiApiHttpConfig = {
    host: '0.0.0.0',
    port: 8080,
    authKey: 'el-bot-js',
    cacheSize: 4096,
    enableWebsocket: false,
    cors: ['*']
  }) {
    this.mahConfig = mahConfig;
    // ws todo

    this.axios = axios.init(this.mahConfig.host + ':' + this.mahConfig.port);
    this.api = new MiraiApiHttp(this.mahConfig, this.axios);

    // default
    this.sessionKey = '';
    this.interval = 200;
    this.qq = 0;
    this.verified = false;
  }

  /**
   * login 登录 QQ 号
   */
  async login(qq: number) {
    this.qq = qq;
    // Todo
    const { session } = await this.auth();
    this.sessionKey = session;
    await this.vertify();
  }

  auth() {
    return this.api.auth();
  }

  vertify() {
    return this.api.verify(this.qq);
  }

  release() {
    return this.api.release();
  }

  on(name: string, callback: Function) {
    if (name === 'message') return this.onMessage(callback);
  }

  /**
   * 监听消息
   * @param callback 回调函数
   */
  onMessage(callback: Function) {
    setInterval(async () => {
      const { data } = await this.api.fetchMessage();
      if (data && data.length) {
        data.forEach(async (msg: MessageType.Message) => {
          msg.reply = async (msgChain: string | MessageType.MessageChain, quote: boolean = false) => this.reply(msgChain, msg, quote);
          callback(msg);
        });
      }
    }, this.interval);
  }

  /**
   * 快速回复
   * @param msg 发送内容
   * @param srcMsg 回复哪条消息
   * @param quote 是否引用回复
   */
  reply(msg: string | MessageType.MessageChain, srcMsg: MessageType.Message, quote: boolean = false) {
    let messageId = 0;

    if (quote && srcMsg.messageChain[0].type === 'Source') {
      messageId = (srcMsg.messageChain[0] as MessageType.Source).id;
    }

    const msgChain: MessageType.MessageChain = typeof msg === 'string' ? [Message.Plain(msg)] : msg;
    if (srcMsg.type === 'FriendMessage') {
      const target = srcMsg.sender.id;
      return this.api.sendFriendMessage(target, msgChain, messageId);
    } else if (srcMsg.type === 'GroupMessage') {
      const target = srcMsg.sender.group.id;
      return this.api.sendGroupMessage(target, msgChain, messageId);
    }
  }
}
