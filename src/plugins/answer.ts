import { isListening } from "../../lib/message";
import { MessageType, Config } from "mirai-ts";
import ElBot from "src/bot";
import { match } from "mirai-ts/src/utils/message";

interface AnswerConfig extends Config.Match {
  listen: Config.Listen;
  reply: string | MessageType.MessageChain;
  quote: boolean;
  else?: string | MessageType.MessageChain;
}

export default function (ctx: ElBot) {
  const config = ctx.el.config;
  const mirai = ctx.mirai;

  mirai.on('message', (msg: MessageType.Message) => {
    if (config.answer) {
      config.answer.every((ans: AnswerConfig) => {
        // 默认监听所有

        if (msg.plain) {
          if (isListening(msg.sender, ans.listen || "all")) {
            if (ans.reply) {
              if (match(msg.plain, ans)) {
                msg.reply(ans.reply, ans.quote);
                return false;
              }
            }
          } else {
            if (ans.else) {
              if (match(msg.plain, ans)) {
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
