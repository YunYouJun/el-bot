import ElBot from "src/bot";
import { el } from "../../index";
import log from "mirai-ts/dist/utils/log";

let config = el.config;
let count = 0;
let startTime = new Date().getTime();
let now = startTime;

function isLimited() {
  now = new Date().getTime();
  if ((now - startTime) > config.limit.interval) {
    count = 0;
    startTime = now;
  } else if (count >= config.limit.count) {
    // 超过限定次数;
    return true;
  }
  return false;
}

export default function limit(ctx: ElBot) {
  config = ctx.el.config;
  const mirai = ctx.mirai;

  let sendFriendMessage = mirai.api.sendFriendMessage;
  let sendGroupMessage = mirai.api.sendGroupMessage;

  mirai.api.sendFriendMessage = async (messageChain, target, quote) => {
    let data = {};
    if (!isLimited()) {
      count += 1;
      data = await sendFriendMessage.apply(mirai.api, [messageChain, target, quote]);
      return data;
    } else {
      log.error("好友消息发送太频繁啦！");
    }
    return data;
  };

  mirai.api.sendGroupMessage = async (messageChain, target, quote) => {
    let data = {};
    if (!isLimited()) {
      count += 1;
      data = await sendGroupMessage.apply(mirai.api, [messageChain, target, quote]);
      return data;
    } else {
      log.error("群消息发送太频繁啦！");
    }
    return data;
  };
}

limit.version = "0.0.1";
limit.description = "限制消息频率";
