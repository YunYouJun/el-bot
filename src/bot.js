const Mirai = require("node-mirai-sdk");
const log = require("../lib/chalk");
const messageHandler = require("./messageHandler");
const Cli = require("./cli");
const { getPlain } = require("../utils/index");

module.exports = class ElBot {
  constructor(el) {
    this.el = el;
  }

  init() {
    const el = this.el;
    this.mirai = new Mirai({
      host: `http://${el.setting.host || "localhost"}:${
        el.setting.port || 8080
      }`,
      authKey: el.setting.authKey || "el-bot-js",
      qq: el.qq,
      enableWebsocket: el.setting.enableWebsocket || false,
    });

    this.auth();
    this.onMessage();
  }

  auth() {
    this.mirai.onSignal("authed", () => {
      log.success("Link Start!");
      log.success(`Session Key(${this.el.qq}): ${this.mirai.sessionKey}`);
      this.mirai.verify();
    });
  }

  onMessage() {
    this.mirai.onMessage((res) => {
      // command for message
      const cmd = getPlain(res.messageChain)
        .split(" ")
        .filter((item) => {
          return item !== "";
        });
      if (cmd[0] === "el") {
        // js auto gc
        this.cli = new Cli(res);
        this.cli.parse(cmd);
      }

      // handle message
      messageHandler(res);
    });
  }

  listen() {
    this.mirai.listen("all");
    process.on("exit", () => {
      this.mirai.release();
    });
  }
};
