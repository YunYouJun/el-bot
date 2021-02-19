import Bot from "el-bot";
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
    .command("nbnhhsh <text...>")
    .description("能不能好好说话？")
    .action(async (text: string[]) => {
      const msg = ctx.mirai.curMsg as MessageType.ChatMessage;
      try {
        const { data } = await guess(text.join(","));
        if (data.length) {
          data.forEach((result: any) => {
            let content = `${result.name} 理解不能`;
            if (result.trans && result.trans.length > 0) {
              content = `${result.name} 的含义：${result.trans.join("，")}`;
            } else if (result.inputting && result.inputting.length > 0) {
              content = `${result.name} 有可能是：${result.inputting.join(
                "，"
              )}`;
            }
            msg.reply(content);
          });
        }
      } catch (e) {
        msg.reply(e.message);
      }
    });
}
