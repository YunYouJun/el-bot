import { resolve } from "path";
import * as config from "../utils/config";
import { MiraiApiHttpConfig } from "mirai-ts";
import { BotConfig } from "./bot";
import { WebhookConfig } from "../bot/webhook";
import { Target } from "../types/config";

const assetsFolder = "data/net.mamoe.mirai-api-http";

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
   * MiraiAPIHTTP setting.yml 路径
   * 或传入 MiraiApiHttpConfig 对象配置
   */
  setting: MiraiApiHttpConfig | string = {
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
  /**
   * 根目录
   */
  base? = process.cwd();
  /**
   * mirai-api-http 文件路径
   */
  path? = {
    /**
     * 图片路径
     */
    image: resolve(this.base!, this.pkg.mcl.folder, `${assetsFolder}/images`),
    /**
     * 语音路径
     */
    voice: resolve(this.base!, this.pkg.mcl.folder, `${assetsFolder}/voices`),
  };
  constructor(el: El) {
    if (typeof el.qq === "string") {
      el.qq = parseInt(el.qq);
    }
    // 合并
    config.merge(this, el);
    // after merge
    // adapt for config path
    if (typeof this.setting === "string") {
      this.setting = config.parse(
        resolve(this.base!, this.setting)
      ) as MiraiApiHttpConfig;
    }
  }
}
