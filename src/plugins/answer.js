const { isListening } = require("../../lib/message");

function onMessage(msg) {
  const config = global.el.config;

  if (config.answer) {
    config.answer.forEach((ans) => {
      // 默认监听所有
      if (
        isListening(msg.sender, ans.listen || "all") &&
        !isListening(msg.sender, ans.except || "none")
      ) {
        if (msg.plain === ans.is || msg.plain.includes(ans.includes)) {
          msg.reply(ans.reply);
        }
      }
    });
  }
}

module.exports = {
  onMessage,
};
