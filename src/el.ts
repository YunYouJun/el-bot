import * as config from "./utils/config";
import { MiraiApiHttpConfig } from "mirai-ts";
import defaultConfig from "./config/default";

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
   * 数据库名
   */
  name?: string;
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
  config: any;
  constructor(el: El) {
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
      name: "el-bot",
      uri: "mongodb://localhost:27017",
    };
    this.config = defaultConfig;
    // 合并
    config.merge(this, el);
  }
}
