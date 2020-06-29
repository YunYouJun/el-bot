import { El } from "..";
import pkg from "../package.json";
import * as config from "./utils/config";

// merge config
const defaultConfig = config.parse("./config/default/index.yml");

let customConfig: any = {};

if (process.env.NODE_ENV === "dev") {
  customConfig = config.parse("./config/custom/dev.yml");
} else {
  customConfig = config.parse("./config/custom/index.yml");
}

// 自定义路径配置
if (customConfig.configs && customConfig.configs.length > 0) {
  customConfig.configs.forEach((configFile: string) => {
    config.merge(customConfig, config.parse(configFile));
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
