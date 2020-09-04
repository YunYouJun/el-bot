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
    enable: true,
    uri: process.env.BOT_DB_URI,
  },
  config: utils.config.parse(resolve(__dirname, "./index.yml")),
};
