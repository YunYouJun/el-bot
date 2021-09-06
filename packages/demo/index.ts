import Bot from "el-bot";
import { MessageType } from "../../../mirai-ts/dist";
import el from "./el.config";

import { card } from "./plugins/card";

async function main() {
  const bot = new Bot(el);
  await bot.start();

  // 卡片测试
  bot.mirai.on("message", (msg: MessageType.ChatMessage) => {
    card(msg);
  });
}

main();
