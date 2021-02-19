import dotenv from "dotenv";
import path from "path";
import { defineConfig } from "el-bot";
import botConfig from "./el/config";

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

export default defineConfig({
  qq: parseInt(process.env.BOT_QQ || ""),
  setting: "./mcl/config/net.mamoe.mirai-api-http/setting.yml",
  db: {
    enable: process.env.EL_DB_ENABLE === "true",
    uri: process.env.BOT_DB_URI,
    analytics: true,
  },
  bot: botConfig,
  webhook: {
    enable: true,
    path: "/webhook",
    port: 7777,
    secret: "el-psy-congroo",
  },
});
