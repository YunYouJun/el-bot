import el from "../el";
import { isListening } from "../../lib/message";
import { MessageType } from "mirai-ts";
import { Config } from "../..";

interface Re {
  pattern: string;
  flags: string;
}

interface AnswerConfig {
  listen: Config.Listen;
  re: Re;
  is: string | string[];
  includes: string | string[];
  reply: string | MessageType.MessageChain;
  quote: boolean;
  else?: string | MessageType.MessageChain;
}

function is(str: string, keywords: string | string[]) {
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

function includes(str: string, keywords: string | string[]) {
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

function match(str: string, ans: AnswerConfig) {
  if (ans.re) {
    let re = new RegExp(ans.re.pattern, ans.re.flags || "i");
    return re.test(str);
  }
  if (ans.is) return is(str, ans.is);
  if (ans.includes) return includes(str, ans.includes);
}

function onMessage(msg: MessageType.Message) {
  const config = el.config;

  if (config.answer) {
    config.answer.every((ans: AnswerConfig) => {
      // 默认监听所有

      if (isListening(msg.sender, ans.listen || "all")) {
        if (ans.reply) {
          if (match(msg.plain, ans)) {
            msg.reply(ans.reply, ans.quote);
            return false;
          }
        }
      } else {
        if (ans.else) {
          if (match(msg.plain, ans)) {
            msg.reply(ans.else, ans.quote);
            return false;
          }
        }
      }

      return true;
    });
  }
}

export {
  is,
  includes,
  match,
  onMessage,
};
