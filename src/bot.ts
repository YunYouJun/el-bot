import Mirai from "../packages/mirai-ts/src";
import log from "./utils/chalk";
import messageHandler from "./messageHandler";
import { El } from "el-bot";
import { MiraiApiHttpConfig } from "packages/mirai-ts/src/mirai-api-http";
import { MessageType } from "mirai-ts";

export default class ElBot {
  public el: El;
  public mirai: Mirai;

  constructor(el: El) {
    const mahConfig: MiraiApiHttpConfig = {
      host: `http://${el.setting.host || "localhost"}`,
      port: el.setting.port || 8080,
      authKey: el.setting.authKey || "el-bot-js",
      enableWebsocket: el.setting.enableWebsocket || false,
    };
    this.el = el;
    this.mirai = new Mirai(mahConfig);
  }

  async init() {
    log.success("Link Start! " + this.el.qq);
    await this.mirai.login(this.el.qq);
  }

  onMessage() {
    this.mirai.onMessage((msg: MessageType.Message) => {
      // handle message
      messageHandler(msg);
    });
  }

  listen() {
    const config = this.el.config;
    this.onMessage();

    if (this.el.active) {
      // load default plugins on
      if (config.plugins.default) {
        config.plugins.default.forEach((name: string) => {
          const plugin = require(`./plugins/${name}`);
          if (plugin.on) {
            plugin.on(this.mirai);
          }
        });
      }

      // load custom plugins on
      if (config.plugins.custom) {
        config.plugins.custom.forEach((name: string) => {
          const plugin = require(`../config/custom/plugins/${name}`);
          if (plugin.on) {
            plugin.on(this.mirai);
          }
        });
      }
    }

    process.on("exit", () => {
      log.info("主人再见");
      this.mirai.release();
    });
  }
};
