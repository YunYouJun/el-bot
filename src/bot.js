const Mirai = require("node-mirai-sdk");
const log = require("../lib/chalk");
const messageHandler = require("./messageHandler");

module.exports = class ElBot {
  constructor(el) {
    this.el = el;
  }

  init() {
    const el = global.el;
    this.mirai = new Mirai({
      host: `http://${el.setting.host || "localhost"}:${
        el.setting.port || 8080
      }`,
      authKey: el.setting.authKey || "el-bot-js",
      qq: el.qq,
      enableWebsocket: el.setting.enableWebsocket || false,
    });
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
    this.mirai.onMessage((msg) => {
      // handle message
      messageHandler(msg);
    });
  }

  listen() {
    const config = global.el.config;

    this.onMessage();
    this.mirai.listen("all");

    // load default plugins on
    if (config.plugins.default) {
      config.plugins.default.forEach((name) => {
        const plugin = require(`./plugins/${name}`);
        if (plugin.on) {
          plugin.on(this.mirai);
        }
      });
    }

    // load custom plugins on
    if (config.plugins.custom) {
      config.plugins.custom.forEach((name) => {
        const plugin = require(`../config/custom/plugins/${name}`);
        if (plugin.on) {
          plugin.on(this.mirai);
        }
      });
    }

    process.on("exit", () => {
      this.mirai.release();
    });
  }
};
