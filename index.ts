import dotenv from "dotenv";
dotenv.config();

import Bot from "./src/bot";
import el from "./src/el";

// init
const bot = new Bot(el);

bot.init();
bot.listen();

export { el, bot };
