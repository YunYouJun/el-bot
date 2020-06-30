if (process.env.NODE_ENV !== 'dev') {
  require('module-alias/register');
}

import dotenv from "dotenv";
dotenv.config();

import Bot from "./src/bot";
import el from "./src/el";

// init
const bot = new Bot(el);

async function app() {
  await bot.init();
  bot.listen();
}

app();

export { el, bot };
