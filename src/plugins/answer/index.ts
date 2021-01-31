import Bot from "el-bot";
import { renderString } from "../../utils/index";
import { MessageType, check } from "mirai-ts";
import axios from "axios";
import * as Config from "../../types/config";
import nodeSchdule from "node-schedule";

interface BaseAnswerOptions extends check.Match {
  /**
   * 监听
   */
  listen: string | Config.Listen;
  /**
   * 不监听
   */
  unlisten?: Config.Listen;
  /**
   * 定时任务
   */
  cron?: nodeSchdule.RecurrenceRule;
  /**
   * 定时发送的对象
   */
  target: Config.Target;
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

type AnswerOptions = BaseAnswerOptions[];

export default function (ctx: Bot, options: AnswerOptions) {
  const { mirai } = ctx;
  if (!options) return;

  // 设置定时
  options.forEach((ans) => {
    if (ans.cron) {
      nodeSchdule.scheduleJob(ans.cron, async () => {
        if (!ans.target) return;
        const replyContent = ans.api
          ? await renderStringByApi(ans.api, ans.reply)
          : ans.reply;
        ctx.sender.sendMessageByConfig(replyContent, ans.target);
      });
    }
  });

  // 应答
  mirai.on("message", async (msg) => {
    // use async in some
    // https://advancedweb.hu/how-to-use-async-functions-with-array-some-and-every-in-javascript/
    for await (const ans of options) {
      let replyContent = null;

      if (ans.at) {
        if (!(msg.type === "GroupMessage" && msg.isAt())) return;
      }

      if (msg.plain && check.match(msg.plain, ans)) {
        // 默认监听所有
        if (ctx.status.getListenStatusByConfig(msg.sender, ans)) {
          replyContent = ans.api
            ? await renderStringByApi(ans.api, ans.reply)
            : ans.reply;
        } else if (ans.else) {
          // 后续可以考虑用监听白名单、黑名单优化
          replyContent = ans.api
            ? await renderStringByApi(ans.api, ans.else)
            : ans.else;
        }

        if (replyContent) {
          await msg.reply(replyContent, ans.quote);
          // 有一个满足即跳出
          break;
        }
      }
    }
  });
}
