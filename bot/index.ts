import Bot from "../src";
import el from "./el";

const bot = new Bot(el);
bot.start();

// 卡片测试
import { card } from "./test/card";
bot.mirai.on("message", card);
