if (process.env.NODE_ENV !== "dev") {
  require("module-alias/register");
}

import Bot from "../src";

const el = require("./config");
const bot = new Bot(el);
console.log(bot.plugins.default);
bot.start();
