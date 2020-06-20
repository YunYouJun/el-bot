const { getPlain } = require("../utils/index");

function messageHandler(msg) {
  const config = global.el.config;
  msg.plain = getPlain(msg.messageChain);

  if (global.el.active) {
    // load default plugins
    if (config.plugins.default) {
      config.plugins.default.forEach((name) => {
        const plugin = require(`../plugins/${name}`);
        if (plugin.onMessage) {
          plugin.onMessage(msg);
        }
      });
    }

    // load custom plugins
    if (config.plugins.custom) {
      config.plugins.custom.forEach((name) => {
        const plugin = require(`../../config/custom/plugins/${name}`);
        if (plugin.onMessage) {
          plugin.onMessage(msg);
        }
      });
    }
  } else {
    const cli = require("../plugins/cli");
    cli.onMessage(msg);
  }
}

module.exports = messageHandler;
