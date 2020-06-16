const Cli = require("./cli");
const answer = require("./answer");
const { forward } = require("./forward");
const { getPlain } = require("../../utils/index");

function messageHandler(msg) {
  const config = global.el.config;
  msg.plain = getPlain(msg.messageChain);

  // rss tip
  if (msg.plain === "rss") {
    let content = "您当前订阅的 RSS 源：";
    config.rss.forEach((item) => {
      content += `\n${item.name}: ${item.url}`;
    });
    msg.reply(content);
    return;
  }

  // cli
  if (config.cli.enable) {
    // command for message
    const cmd = getPlain(msg.messageChain)
      .split(" ")
      .filter((item) => {
        return item !== "";
      });
    if (cmd[0] === "el") {
      // js auto gc
      this.cli = new Cli(msg);
      this.cli.parse(cmd);
      return;
    }
  }

  // reply
  if (config.answer) {
    answer(msg);
    return;
  }

  // forward
  if (config.forward) {
    forward(msg);
  }
}

module.exports = messageHandler;
