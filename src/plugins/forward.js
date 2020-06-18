const { isListening, sendMessageByConfig } = require("../../lib/message");

function onMessage(msg) {
  const config = global.el.config;

  if (config.forward) {
    config.forward.forEach((item) => {
      let canForward = isListening(msg.sender, item.listen);

      if (canForward) {
        sendMessageByConfig(msg.messageChain, item.target);
      }
    });
  }
}

module.exports = {
  onMessage,
};
