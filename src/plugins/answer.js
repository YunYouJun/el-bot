const { isListening } = require("../../lib/message");

function onMessage(msg) {
  const config = global.el.config;

  if (config.answer) {
    config.answer.forEach((ans) => {
      // 默认监听所有
      if (isListening(msg.sender, ans.listen || "all")) {
        if (msg.plain === ans.is || msg.plain.includes(ans.includes)) {
          if (ans.reply) msg.reply(ans.reply);
        }
      } else {
        if (msg.plain === ans.is || msg.plain.includes(ans.includes)) {
          if (ans.else) msg.reply(ans.else);
        }
      }
    });
  }
}

module.exports = {
  onMessage,
};
