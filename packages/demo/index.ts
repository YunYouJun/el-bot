import Bot from "el-bot";
import el from "./el.config";

const bot = new Bot(el);
bot.start();

// 卡片测试
import { card } from "./plugins/card";
bot.mirai.on("message", card);
