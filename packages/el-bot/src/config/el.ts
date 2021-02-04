import * as config from "../utils/config";
import { MiraiApiHttpConfig } from "mirai-ts";
import defaultConfig, { BotConfig } from "./default";
import { WebhookConfig } from "../bot/webhook";

export interface dbConfig {
  /**
   * 是否启用
   */
  enable: boolean;
  /**
   * 数据库连接 uri
   */
  uri?: string;
  /**
   * 是否进行统计分析
   */
  analytics?: Boolean;
}

export default class El {
  qq: number;
  /**
   * MiraiAPIHTTP setting.yml
   */
  setting: MiraiApiHttpConfig;
  /**
   * mongodb 数据库默认配置
   */
  db: dbConfig;
  config: BotConfig;
  webhook: WebhookConfig;
  pkg?: any;
  constructor(el: El) {
    if (typeof el.qq === "string") {
      el.qq = parseInt(el.qq);
    }
    this.qq = 0;
    this.setting = {
      host: "0.0.0.0",
      port: 4859,
      authKey: "el-psy-congroo",
      cacheSize: 4096,
      enableWebsocket: true,
      cors: ["*"],
    };
    this.db = {
      enable: false,
    };
    this.config = defaultConfig;
    this.webhook = {
      enable: true,
      port: 7777,
      path: "/webhook",
      secret: "el-psy-congroo",
    };
    // 合并
    config.merge(this, el);
    // el-bot package.json
    this.pkg = require("../../package.json");
  }
}
