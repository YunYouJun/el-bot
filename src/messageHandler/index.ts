import { getPlain } from "../utils/index";
import el from "../el";
import { MessageType } from "mirai-ts";

declare module "mirai-ts" {
  namespace MessageType {
    interface Message {
      plain: string;
    }
  }
}

function messageHandler(msg: MessageType.Message) {
  const config = el.config;

  if (msg.messageChain) {
    msg.plain = getPlain(msg.messageChain);
  }

  if (el.active) {
    // load default plugins
    if (config.plugins.default) {
      config.plugins.default.forEach((name: string) => {
        const plugin = require(`../plugins/${name}`);
        if (plugin.onMessage) {
          plugin.onMessage(msg);
        }
      });
    }

    // load custom plugins
    if (config.plugins.custom) {
      config.plugins.custom.forEach((name: string) => {
        const plugin = require(`../../config/custom/plugins/${name}`);
        if (plugin.onMessage) {
          plugin.onMessage(msg);
        }
      });
    }
  } else {
    const cli = require("../plugins/cli");
    cli.onMessage(msg);
  }
}

export default messageHandler;
