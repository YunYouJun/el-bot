import { resolve } from "path";
import dotenv from "dotenv";
import * as utils from "../../src/utils";

dotenv.config({
  path: resolve(__dirname, "../.env"),
});

export = {
  qq: parseInt(process.env.BOT_QQ || ""),
  setting: {
    enableWebsocket: true,
  },
  db: {
    enable: process.env.EL_DB_ENABLE === "true",
    uri: process.env.BOT_DB_URI,
    analytics: true,
  },
  config: utils.config.parse(resolve(__dirname, "./index.yml")),
  webhook: {
    enable: true,
    path: "/webhook",
    port: 7777,
    secret: "el-psy-congroo",
  },
};
