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

function reply(msg, content, quote) {
  if (quote) {
    msg.quoteReply(content);
  } else {
    msg.reply(content);
  }
}

function onMessage(msg) {
  const config = global.el.config;

  if (config.answer) {
    config.answer.every((ans) => {
      // 默认监听所有

      if (isListening(msg.sender, ans.listen || "all")) {
        if (ans.reply) {
          if (match(msg.plain, ans)) {
            reply(msg, ans.reply, ans.quote);
            return false;
          }
        }
      } else {
        if (ans.else) {
          if (match(msg.plain, ans)) {
            reply(msg, ans.else, ans.quote);
            return false;
          }
        }
      }

      return true;
    });
  }
}

module.exports = {
  is,
  includes,
  match,
  onMessage,
};
