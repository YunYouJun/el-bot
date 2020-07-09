import { isListening } from "../utils/message";
import { MessageType, Config } from "mirai-ts";
import ElBot from "../bot";
import { match } from "mirai-ts/dist/utils/message";
import axios from "axios";
import { renderString } from "@utils/message";

interface AnswerConfig extends Config.Match {
  listen: Config.Listen;
  api?: string;
  reply: string | MessageType.MessageChain;
  quote: boolean;
  else?: string | MessageType.MessageChain;
}

/**
 * 根据 API 返回的内容渲染字符串
 * @param api 
 * @param content 
 */
async function renderStringByApi(api: string, content: string | MessageType.MessageChain) {
  if (api) {
    const { data } = await axios.get(api);
    if (typeof content === "string") {
      return renderString(content, data, "data");
    } else {
      (content as any).forEach((msg: MessageType.SingleMessage) => {
        if (msg.type === "Plain") {
          msg.text = renderString(msg.text, data, "data");
        }
      });
      return content;
    }
  } else {
    return content;
  }
}

export default function answer(ctx: ElBot) {
  const config = ctx.el.config;
  const mirai = ctx.mirai;

  mirai.on('message', (msg: MessageType.SingleMessage) => {
    if (config.answer) {
      config.answer.every(async (ans: AnswerConfig) => {
        // 默认监听所有

        if (msg.plain) {
          if (isListening(msg.sender, ans.listen || "all")) {
            if (ans.reply) {
              if (match(msg.plain, ans)) {
                if (ans.api) ans.reply = await renderStringByApi(ans.api, ans.reply);
                msg.reply(ans.reply, ans.quote);
                return false;
              }
            }
          } else {
            if (ans.else) {
              if (match(msg.plain, ans)) {
                if (ans.api) ans.else = await renderStringByApi(ans.api, ans.else);
                msg.reply(ans.else, ans.quote);
                return false;
              }
            }
          }
        }

        return true;
      });
    }
  });
}

answer.version = "0.0.1";
answer.description = "自动应答";
