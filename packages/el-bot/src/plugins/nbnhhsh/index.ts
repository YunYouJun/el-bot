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
      const msg = ctx.mirai.curMsg;
      const { data } = await guess(text.join(","));
      if (data.length) {
        data.forEach((result: any) => {
          let content = "理解不能";
          if (result.trans) {
            content = `${result.name} 的含义：${result.trans.join("，")}`;
          } else if (result.inputting) {
            content = `${result.name} 有可能是：${result.inputting.join("，")}`;
          }
          (msg as MessageType.ChatMessage).reply(content);
        });
      }
    });
}
