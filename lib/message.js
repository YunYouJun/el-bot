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

  console.log(messageChain);
  if (target.group) {
    target.group.forEach((qq) => {
      mirai.sendGroupMessage(messageChain, qq);
    });
  }
}

module.exports = {
  sendMessageByConfig,
};
