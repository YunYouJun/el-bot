import * as config from "./utils/config";
import log from "mirai-ts/dist/utils/log";
import { MiraiApiHttpConfig } from "mirai-ts";

export default class El {
  qq: number;
  /**
   * MiraiAPIHTTP setting.yml
   */
  setting: MiraiApiHttpConfig;
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
    this.config = this.getConfig();
    // 合并
    config.merge(this, el);
  }

  getConfig() {
    // merge config
    const defaultConfig = config.parse("./config/default/index.yml");

    let customConfig: any = {
      // 默认数据库地址
      db_path: './tmp/el-bot.json'
    };

    try {
      if (process.env.NODE_ENV === "dev") {
        customConfig = config.parse("./config/custom/dev.yml");
      } else {
        customConfig = config.parse("./config/custom/index.yml");
      }
    } catch (err) {
      console.log(err);
      log.error(
        "加载自定义配置失败，当前只有默认配置（请新建 config/custom/index.yml 文件）"
      );
    }

    // 自定义的配置路径
    if (customConfig.config_files && customConfig.config_files.length > 0) {
      customConfig.config_files.forEach((configFile: string) => {
        try {
          config.merge(customConfig, config.parse(configFile));
        } catch (err) {
          console.log(err);
          log.error(
            `请检查 config_files 中 ${configFile} 文件是否存在，或语法是否正确`
          );
        }
      });
    }

    config.merge(defaultConfig, customConfig);

    return defaultConfig;
  }
};
