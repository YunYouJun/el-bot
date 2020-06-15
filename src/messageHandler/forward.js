const { isListening, sendMessageByConfig } = require("../../lib/message");

function forward(msg, config) {
  let canForward = isListening(msg.sender, config.listen);

  if (canForward) {
    sendMessageByConfig(msg.messageChain, config.target);
  }
}

module.exports = {
  forward,
};
