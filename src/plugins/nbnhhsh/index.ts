import Bot from "src/bot";
import { MessageType } from "mirai-ts";
import axios from "axios";

async function guess(text: string) {
  const API_URL = "https://lab.magiconch.com/api/nbnhhsh/guess";
  return axios.post(API_URL, {
    text,
  });
}

export default function (ctx: Bot) {
  const { cli } = ctx;
  cli
    .command("nbnhhsh <text>")
    .description("能不能好好说话？")
    .action(async (text: string) => {
      const msg = ctx.mirai.curMsg;
      const { data } = await guess(text);
      if (data.length) {
        const content = `可能的含义：${data[0].trans.join("，")}`;
        (msg as MessageType.ChatMessage).reply(content);
      }
    });
}
