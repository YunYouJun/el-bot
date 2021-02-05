import * as config from "../utils/config";
import { MiraiApiHttpConfig } from "mirai-ts";
import { BotConfig } from "./bot";
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
  qq = 0;
  /**
   * MiraiAPIHTTP setting.yml
   */
  setting: MiraiApiHttpConfig = {
    host: "0.0.0.0",
    port: 4859,
    authKey: "el-psy-congroo",
    cacheSize: 4096,
    enableWebsocket: true,
    cors: ["*"],
  };
  /**
   * mongodb 数据库默认配置
   */
  db?: dbConfig = {
    enable: false,
  };
  bot: BotConfig = {
    name: "el-bot",
    plugins: {
      default: [
        "answer",
        "forward",
        "limit",
        "memo",
        "rss",
        "search",
        "qrcode",
      ],
    },
    master: [910426929],
    admin: [910426929],
  };
  webhook?: WebhookConfig = {
    enable: true,
    port: 7777,
    path: "/webhook",
    secret: "el-psy-congroo",
  };
  // el-bot package.json
  pkg? = require("../../package.json");
  constructor(el: El) {
    if (typeof el.qq === "string") {
      el.qq = parseInt(el.qq);
    }
    // 合并
    config.merge(this, el);
  }
}
