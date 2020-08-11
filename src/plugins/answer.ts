import { renderString } from "../utils/index";
import { MessageType, check } from "mirai-ts";
import Bot from "../bot";
import axios from "axios";
import * as Config from "../types/config";

interface AnswerConfig extends check.Match {
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
async function renderStringByApi(
  api: string,
  content: string | MessageType.MessageChain
) {
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

export default function answer(ctx: Bot, config: AnswerConfig[]) {
  const mirai = ctx.mirai;

  mirai.on("message", async (msg) => {
    console.log(msg);
    console.log(config);
    if (config) {
      // use async in some
      // https://advancedweb.hu/how-to-use-async-functions-with-array-some-and-every-in-javascript/
      for await (const ans of config) {
        let replyContent = null;

        if (ans.at && !check.isAt(msg, ctx.el.qq)) return;

        if (msg.plain && check.match(msg.plain, ans)) {
          // 默认监听所有
          if (ctx.status.getListenStatusByConfig(msg.sender, ans)) {
            replyContent = ans.api
              ? await renderStringByApi(ans.api, ans.reply)
              : ans.reply;
          } else if (ans.else) {
            // 后续可以考虑用监听白名单、黑名单优化
            replyContent = ans.api
              ? renderStringByApi(ans.api, ans.else)
              : ans.else;
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

answer.version = "0.0.2";
answer.description = "自动应答";
