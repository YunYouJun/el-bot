if (process.env.NODE_ENV !== "dev") {
  require("module-alias/register");
}

import Bot from "../src";
// import * as config from "../src/utils/config";
// import { resolve } from "path";

const el = require("./el");

// let customConfig: any = {};
// try {
//   if (process.env.NODE_ENV === "dev") {
//     customConfig = config.parse(resolve(__dirname, "./config/dev.yml"));
//   } else {
//     customConfig = config.parse(resolve(__dirname, "./config/index.yml"));
//   }
// } catch (err) {
//   console.log(err);
// }

// // 自定义的配置路径
// if (customConfig.config_files && customConfig.config_files.length > 0) {
//   customConfig.config_files.forEach((configFile: string) => {
//     try {
//       config.merge(customConfig, config.parse(resolve(__dirname, configFile)));
//     } catch (err) {
//       console.log(err);
//     }
//   });
// }

// // 合并自定义配置;
// config.merge(el.config, customConfig);

const bot = new Bot(el);
bot.start();
