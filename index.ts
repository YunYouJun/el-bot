import dotenv from 'dotenv';
dotenv.config();

import Bot from "./src/bot";
import el from "./src/el";

// init
const bot = new Bot(el);

(global as any).el = el;
(global as any).bot = bot;

bot.init();
bot.listen();
