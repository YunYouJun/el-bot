function forward(res, config) {
  const mirai = global.bot.mirai;

  let canForward = false;
  if (res.sender.group) {
    // 群
    if (
      config.listen.group &&
      config.listen.group.includes(res.sender.group.id)
    ) {
      canForward = true;
    }
  } else {
    // 私聊
    if (config.listen.friend && config.listen.friend.includes(res.sender.id)) {
      canForward = true;
    }
  }

  if (canForward) {
    if (config.target.friend) {
      config.target.friend.forEach((qq) => {
        mirai.sendFriendMessage(res.messageChain, qq);
      });
    }

    if (config.target.group) {
      config.target.group.forEach((qq) => {
        mirai.sendGroupMessage(res.messageChain, qq);
      });
    }
  }
}

module.exports = {
  forward,
};
