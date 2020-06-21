import axios from "./axios";
import { AxiosStatic } from "axios";
import MiraiApiHttp from "./mirai-api-http";
import { MiraiApiHttpConfig } from "./mirai-api-http";
import Message from "./message";
import * as MessageType from "../types/message-type";

/**
 * Mirai SDK 初始化类
 */
export default class Mirai {
  /**
   * 封装 mirai-api-http 的固有方法
   */
  mah: MiraiApiHttp;
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
    this.mah = new MiraiApiHttp(this.mahConfig, this.axios);

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
    await this.auth();
    await this.vertify();
  }

  async auth() {
    await this.mah.auth();
  }

  async vertify() {
    await this.mah.verify(this.qq);
  }

  release() {
    this.mah.release();
  }

  on(name: string, callback: Function) {
    if (name === 'message') return this.onMessage(callback);
  }

  onMessage(callback: Function) {
    setInterval(async () => {
      const { data } = await this.mah.fetchMessage();
      if (data && data.length) {
        data.forEach((message: MessageType.Message) => {
          const msg = new Message(message, this.mah);
          callback(msg);
        });
      }
    }, this.interval);
  }
}
