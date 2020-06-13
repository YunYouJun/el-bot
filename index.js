const Bot = require("./src/bot");
const el = require("./src/el");
global.el = el;

// init
const bot = new Bot(el);
bot.init();
bot.listen();

global.bot = bot;
