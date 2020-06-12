const Bot = require("./src/bot");
const el = require("./src/el");

// init
const bot = new Bot(el);
bot.init();
bot.listen();

global.el = el;
global.bot = bot;
