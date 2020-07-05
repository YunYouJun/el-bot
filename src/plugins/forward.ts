import { isListening, sendMessageByConfig } from "../utils/message";
import { Config, MessageType } from "mirai-ts";
import el from "../el";
import ElBot from "../bot";

interface ForwardConfig {
  listen: Config.Listen;
  target: Config.Target;
}

export default function forward(ctx: ElBot) {
  const mirai = ctx.mirai;
  mirai.on('message', (msg: MessageType.SingleMessage) => {
    if (!msg.sender) return;

    const config = el.config;

    try {
      if (config.forward) {
        config.forward.forEach((item: ForwardConfig) => {
          const canForward = isListening(msg.sender, item.listen);

          if (canForward) {
            // remove source
            msg.messageChain.shift();
            sendMessageByConfig(msg.messageChain, item.target);
          }
        });
      }
    } catch (error) {
      console.log("ok");
    }

  });
}

forward.version = "0.0.1";
forward.description = "消息转发";
