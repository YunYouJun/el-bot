const { getPlain } = require("../../utils/index");

function messageHandler(msg) {
  const config = global.el.config;
  msg.plain = getPlain(msg.messageChain);

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
}

module.exports = messageHandler;
