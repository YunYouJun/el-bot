import { renderString, getListenStatusByConfig } from "@utils/index";
import { MessageType, Config } from "mirai-ts";
import ElBot from "../bot";
import { match } from "mirai-ts/dist/utils/message";
import axios from "axios";
import { isAt } from "mirai-ts/dist/message";

interface AnswerConfig extends Config.Match {
  /**
   * 监听
   */
  listen: string | Config.Listen;
  /**
   * 不监听
   */
  unlisten?: Config.Listen;
  /**
   * API 地址，存在时，自动渲染字符串
   */
  api?: string;
  reply: string | MessageType.MessageChain;
  /**
   * 只有被 @ 时回复
   */
  at?: boolean;
  /**
   * 回复时是否引用消息
   */
  quote?: boolean;
  else?: string | MessageType.MessageChain;
}

/**
 * 根据 API 返回的内容渲染字符串
 * @param api 
 * @param content 
 */
async function renderStringByApi(api: string, content: string | MessageType.MessageChain) {
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
}

export default function answer(ctx: ElBot) {
  const config = ctx.el.config;
  const mirai = ctx.mirai;

  mirai.on('message', async (msg: MessageType.ChatMessage) => {
    if (config.answer) {

      // use async in some
      // https://advancedweb.hu/how-to-use-async-functions-with-array-some-and-every-in-javascript/
      let ans: AnswerConfig = {
        listen: 'all',
        is: "el psy congroo",
        reply: '喵喵喵？'
      };

      for await (ans of config.answer) {
        let replyContent = null;
        if (ans.at && !isAt(msg, ctx.el.qq)) return;

        if (msg.plain && match(msg.plain, ans)) {
          // 默认监听所有
          if (getListenStatusByConfig(msg.sender, ans)) {
            replyContent = ans.api ? await renderStringByApi(ans.api, ans.reply) : ans.reply;
          } else if (ans.else) {
            // 后续可以考虑用监听白名单、黑名单优化
            replyContent = ans.api ? renderStringByApi(ans.api, ans.else) : ans.else;
          }

          if (replyContent) {
            await msg.reply(replyContent, ans.quote);
            // 有一个满足即跳出
            break;
          }
        }
      }
    }
  });
}

answer.version = "0.0.1";
answer.description = "自动应答";
