const log = require("./lib/chalk");
const pkg = require("./package.json");
const config = require("./lib/config");

const Mirai = require("node-mirai-sdk");
const { Plain, At } = Mirai.MessageComponent;

// read config
const el = {};
el.qq = process.env.BOT_QQ;
el.setting = config.parse("./plugins/MiraiAPIHTTP/setting.yml");

const defaultConfig = config.parse("./config/default/index.yml");
const customConfig = config.parse("./config/custom/index.yml");
config.merge(defaultConfig, customConfig);
el.config = defaultConfig;

const bot = new Mirai({
  host: `http://${el.setting.host || "localhost"}:${el.setting.port || 8080}`,
  authKey: el.setting.authKey,
  qq: el.qq,
  enableWebsocket: el.setting.enableWebsocket || false,
});

bot.onSignal("authed", () => {
  log.success("Link Start!");
  log.success(`Session Key(${el.qq}): ${bot.sessionKey}`);
  bot.verify();
});

bot.onMessage((message) => {
  const { type, sender, messageChain, reply, quoteReply } = message;
  let msg = "";
  messageChain.forEach((chain) => {
    if (chain.type === "Plain") msg += Plain.value(chain);
  });
  // 直接回复
  if (msg.includes("收到了吗")) reply("收到了收到了");
  // 或者: bot.reply('收到了', message)
  // 引用回复, 失败时会自动退化到普通回复
  else if (msg.includes("引用我"))
    quoteReply([At(sender.id), Plain("好的")], message);
  // 撤回
  else if (msg.includes("撤回")) bot.recall(message);
});

bot.listen("all");

process.on("exit", () => {
  bot.release();
});
