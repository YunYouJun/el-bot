/**
 * 是否监听发送者
 * @param {Object} sender
 */
function isListening(sender, listen) {
  if (listen === "all") {
    return true;
  }

  if (sender.group) {
    // 群
    if (
      listen === "group" ||
      (listen.group && listen.group.includes(sender.group.id))
    ) {
      return true;
    }
  } else {
    // 私聊
    if (
      listen === "friend" ||
      (listen.friend && listen.friend.includes(sender.id))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * 通过配置发送消息
 * @param {MessageChain} messageChain
 * @param {object} target
 */
function sendMessageByConfig(messageChain, target) {
  const mirai = global.bot.mirai;

  if (target.friend) {
    target.friend.forEach((qq) => {
      mirai.sendFriendMessage(messageChain, qq);
    });
  }

  if (target.group) {
    target.group.forEach((qq) => {
      mirai.sendGroupMessage(messageChain, qq);
    });
  }
}

module.exports = {
  isListening,
  sendMessageByConfig,
};
