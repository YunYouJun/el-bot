const { isListening } = require("../../lib/message");

function is(str, keywords) {
  let test = false;
  if (!Array.isArray(keywords)) {
    test = str === keywords;
  } else {
    keywords.forEach((keyword) => {
      test = test || str === keyword;
    });
  }
  return test;
}
function includes(str, keywords) {
  let test = true;
  if (!Array.isArray(keywords)) {
    test = str.includes(keywords);
  } else {
    keywords.forEach((keyword) => {
      test = test && str.includes(keyword);
    });
  }
  return test;
}

function match(str, ans) {
  if (ans.re) {
    let re = new RegExp(ans.re.pattern, ans.re.flags || "i");
    return re.test(str);
  }
  if (ans.is) return is(str, ans.is);
  if (ans.includes) return includes(str, ans.includes);
}

function onMessage(msg) {
  const config = global.el.config;

  if (config.answer) {
    config.answer.every((ans) => {
      // 默认监听所有

      if (isListening(msg.sender, ans.listen || "all")) {
        if (match(msg.plain, ans)) {
          if (ans.reply) msg.reply(ans.reply);
          return false;
        }
      } else {
        if (ans.else) {
          if (match(msg.plain, ans)) {
            msg.reply(ans.else);
            return false;
          }
        }
      }

      return true;
    });
  }
}

module.exports = {
  onMessage,
};
