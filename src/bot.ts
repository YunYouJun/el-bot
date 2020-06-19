import Mirai from "node-mirai-sdk";
import log from "../lib/chalk";
import messageHandler from "./messageHandler";

interface Setting {
  authKey: string,
  enableWebsocket: boolean,
  host: string,
  port: number;
}

interface El {
  pkg: object,
  qq: number,
  setting: Setting,
  config: any,
  active: boolean;
}

export default class ElBot {
  public el: El;
  public mirai: Mirai;

  constructor(el: El) {
    this.el = el;
    this.mirai = new Mirai({
      host: `http://${el.setting.host || "localhost"}:${
        el.setting.port || 8080
        }`,
      authKey: el.setting.authKey || "el-bot-js",
      qq: el.qq,
      enableWebsocket: el.setting.enableWebsocket || false,
    });
  }

  init() {
    this.auth();
  }

  auth() {
    this.mirai.onSignal("authed", () => {
      log.success(`Link Start! (${this.el.qq})`);
      // log.success(`Session Key(${this.el.qq}): ${this.mirai.sessionKey}`);
      this.mirai.verify();
    });
  }

  onMessage() {
    this.mirai.onMessage((msg: object) => {
      // handle message
      messageHandler(msg);
    });
  }

  listen() {
    const config = this.el.config;

    this.onMessage();
    this.mirai.listen("all");

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
