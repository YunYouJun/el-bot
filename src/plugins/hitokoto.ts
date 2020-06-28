import axios from "axios";
import ElBot from "../bot";
import { match } from "mirai-ts/dist/utils/message";
import { MessageType } from "mirai-ts";

import schedule from "node-schedule";
import { sendMessageByConfig } from "../utils/message";

async function getSentence(params: object) {
  const { data } = await axios.get('https://v1.hitokoto.cn', {
    params: params
  });
  let words = data.hitokoto + ' ——' + data.from;
  if (data.from_who) words += data.from_who;
  return words;
}

export default function (ctx: ElBot) {
  const config = ctx.el.config;
  const mirai = ctx.mirai;
  const hitokoto = config.hitokoto;

  if (hitokoto.cron && hitokoto.target) {
    schedule.scheduleJob(hitokoto.cron, async () => {
      const words = await getSentence(hitokoto.params);
      sendMessageByConfig(words, hitokoto.target);
    });
  }

  mirai.on('message', async (msg: MessageType.SingleMessage) => {
    if (match(msg.plain, hitokoto.match)) {
      const words = await getSentence(hitokoto.params);
      msg.reply(words);
    }
  });
}
