const { isListening } = require("../../lib/message");

function onMessage(msg) {
  const config = global.el.config;
  config.answer.forEach((ans) => {
    // 默认监听群
    if (isListening(msg.sender, ans.listen || "group")) {
      if (msg.plain === ans.is || msg.plain.includes(ans.includes)) {
        msg.reply(ans.reply);
      }
    }
  });
}

module.exports = {
  onMessage,
};
