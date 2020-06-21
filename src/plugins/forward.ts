import { isListening, sendMessageByConfig } from "../../lib/message";
import { MessageType } from "mirai-ts";
import el from "../el";
import { Config } from "../..";

interface ForwardConfig {
  listen: Config.Listen;
  target: Config.Target;
}

function onMessage(msg: MessageType.Message) {
  const config = el.config;

  if (config.forward) {
    config.forward.forEach((item: ForwardConfig) => {
      let canForward = isListening(msg.sender, item.listen);

      if (canForward) {
        sendMessageByConfig(msg.messageChain, item.target);
      }
    });
  }
}

module.exports = {
  onMessage,
};
