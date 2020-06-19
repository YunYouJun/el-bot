import pkg from "../package.json";
const config = require("../lib/config");

interface Setting {
  authKey: string,
  enableWebsocket: boolean,
  host: string,
  port: number;
}

interface El {
  pkg: object,
  qq: number,
  setting: Setting,
  config: any,
  active: boolean;
}

// merge config
const defaultConfig = config.parse("./config/default/index.yml");

let customConfig = {};

if (process.env.NODE_ENV === "dev") {
  customConfig = config.parse("./config/custom/test.yml");
} else {
  customConfig = config.parse("./config/custom/index.yml");
}

config.merge(defaultConfig, customConfig);

const el: El = {
  pkg,
  qq: parseInt(process.env.BOT_QQ || '0'),
  setting: config.parse("./plugins/MiraiAPIHTTP/setting.yml"),
  config: defaultConfig,
  active: true,
};

export default el;