import Bot from "el-bot";
import axios from "axios";
import { check } from "mirai-ts";
import { utils } from "el-bot";
import { NiubiOptions } from "./options";

async function getRandomSentence(url: string, name: string) {
  let sentence = "";
  const { data } = await axios.get(url);
  sentence = utils.renderString(data[0], name, "name");
  return sentence;
}

export default function (ctx: Bot, options: NiubiOptions) {
  const { mirai } = ctx;

  // 覆盖默认配置
  mirai.on("message", (msg) => {
    let name = "我";

    options.match.forEach(async (option) => {
      const str = check.match(msg.plain.toLowerCase(), option);
      if (!str) {
        return;
      } else if (Array.isArray(str) && str[1]) {
        name = str[1];
      }

      msg.messageChain.some((singleMessage) => {
        if (singleMessage.type === "At" && singleMessage.display) {
          name = "「" + singleMessage.display.slice(1) + "」";
          return true;
        }
      });

      const sentence = await getRandomSentence(options.url, name);
      msg.reply(sentence);
    });
  });

  // 进群时
  mirai.on("MemberJoinEvent", async (msg) => {
    const sentence = await getRandomSentence(
      options.url,
      msg.member.memberName
    );
    mirai.api.sendGroupMessage(sentence, msg.member.group.id);
  });
}
