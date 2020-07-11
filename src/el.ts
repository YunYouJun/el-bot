import { El } from "..";
import pkg from "../package.json";
import * as config from "./utils/config";
import log from "mirai-ts/dist/utils/log";

// merge config
const defaultConfig = config.parse("./config/default/index.yml");

let customConfig: any = {};

try {
  if (process.env.NODE_ENV === "dev") {
    customConfig = config.parse("./config/custom/dev.yml");
  } else {
    customConfig = config.parse("./config/custom/index.yml");
  }
} catch (err) {
  console.log(err);
  log.error("加载自定义配置失败，当前只有默认配置（请新建 config/custom/index.yml 文件）");
}

// 自定义的配置路径
if (customConfig.config_files && customConfig.config_files.length > 0) {
  customConfig.config_files.forEach((configFile: string) => {
    try {
      config.merge(customConfig, config.parse(configFile));
    } catch (err) {
      console.log(err);
      log.error(`请检查 config_files 中 ${configFile} 文件是否存在，或语法是否正确`);
    }
  });
}

config.merge(defaultConfig, customConfig);

const el: El = {
  pkg,
  qq: parseInt(process.env.BOT_QQ || "0"),
  setting: config.parse("./plugins/MiraiAPIHTTP/setting.yml"),
  config: defaultConfig,
};

export default el;
