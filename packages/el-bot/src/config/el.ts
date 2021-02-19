import * as config from "../utils/config";
import { MiraiApiHttpConfig } from "mirai-ts";
import { BotConfig } from "./bot";
import { WebhookConfig } from "../bot/webhook";
import { Target } from "../types/config";

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

/**
 * 上报配置
 */
export interface reportConfig {
  /**
   * 是否启用
   */
  enable: boolean;
  /**
   * 上报对象
   */
  target?: Target;
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
  /**
   * 机器人及相关插件配置
   */
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
    devGroup: 120117362,
  };
  /**
   * webhook 配置
   */
  webhook?: WebhookConfig = {
    enable: true,
    port: 7777,
    path: "/webhook",
    secret: "el-psy-congroo",
  };
  /**
   * 上报错误信息配置
   */
  report?: reportConfig = {
    enable: false,
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
