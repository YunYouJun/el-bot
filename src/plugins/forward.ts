import { isListening, sendMessageByConfig } from "../../lib/message";
import { MessageType } from "mirai-ts";
import el from "../el";
import { Config } from "../..";
import ElBot from "src/bot";

interface ForwardConfig {
  listen: Config.Listen;
  target: Config.Target;
}

export default function (ctx: ElBot) {
  const mirai = ctx.mirai;
  mirai.on('message', (msg: MessageType.Message) => {
    if (!msg.sender) return;

    const config = el.config;

    if (config.forward) {
      config.forward.forEach((item: ForwardConfig) => {
        const canForward = isListening(msg.sender, item.listen);

        if (canForward) {
          sendMessageByConfig(msg.messageChain, item.target);
        }
      });
    }
  });
}
