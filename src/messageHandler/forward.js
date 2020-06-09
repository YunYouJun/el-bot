const { getPlain } = require("../../utils/index");

function forward(res, config) {
  const msg = getPlain(res.messageChain);

  if (config.listen.friend) {
    config.listen.friend.forEach(() => {
      res.reply(msg);
    });
  }

  if (config.listen.group) {
    config.listen.group.forEach(() => {
      res.reply(msg);
    });
  }
}

module.exports = {
  forward,
};
