const Cli = require("./cli");
const rss = require("./rss");
const { forward } = require("./forward");
const { getPlain } = require("../../utils/index");

function messageHandler(msg) {
  const config = global.el.config;
  msg.plain = getPlain(msg.messageChain);

  // cli
  if (this.el.config.cli.enable) {
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
    }
  }

  // forward
  if (config.forward) {
    config.forward.forEach((item) => {
      console.log(item);
      forward(msg, item);
    });
  }

  // rss
  if (config.rss) {
    rss(msg);
  }
}

module.exports = messageHandler;
