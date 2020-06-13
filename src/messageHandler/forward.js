const { sendMessageByConfig } = require("../../lib/message");

function forward(msg, config) {
  const mirai = global.bot.mirai;

  let canForward = false;
  if (msg.sender.group) {
    // 群
    if (
      config.listen.group &&
      config.listen.group.includes(msg.sender.group.id)
    ) {
      canForward = true;
    }
  } else {
    // 私聊
    if (config.listen.friend && config.listen.friend.includes(msg.sender.id)) {
      canForward = true;
    }
  }

  if (canForward) {
    sendMessageByConfig(msg.messageChain, config.target);
  }
}

module.exports = {
  forward,
};
