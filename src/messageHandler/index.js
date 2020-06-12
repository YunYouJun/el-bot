const Cli = require("./cli");
const { forward } = require("./forward");
const { getPlain } = require("../../utils/index");

function messageHandler(res) {
  const config = global.el.config;
  res.plain = getPlain(res.messageChain);

  // cli
  if (this.el.config.cli.enable) {
    // command for message
    const cmd = getPlain(res.messageChain)
      .split(" ")
      .filter((item) => {
        return item !== "";
      });
    if (cmd[0] === "el") {
      // js auto gc
      this.cli = new Cli(res);
      this.cli.parse(cmd);
    }
  }

  // forward
  if (config.forward) {
    config.forward.forEach((item) => {
      forward(res, item);
    });
  }
}

module.exports = messageHandler;
