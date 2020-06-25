import Mirai from "../packages/mirai-ts/src";
import log from "./utils/chalk";
import { El } from "el-bot";
import { MiraiApiHttpConfig } from "packages/mirai-ts/src/mirai-api-http";

export default class ElBot {
  el: El;
  mirai: Mirai;
  // 激活
  active: boolean;

  constructor(el: El) {
    const mahConfig: MiraiApiHttpConfig = {
      host: `http://${el.setting.host || "localhost"}`,
      port: el.setting.port || 8080,
      authKey: el.setting.authKey || "el-bot-js",
      enableWebsocket: el.setting.enableWebsocket || false,
    };
    this.el = el;
    this.mirai = new Mirai(mahConfig);
    this.active = true;
  }

  async init() {
    log.info("Link Start! " + this.el.qq);
    await this.mirai.login(this.el.qq);
  }

  /**
   * 加载所有的插件
   */
  loadPlugins() {
    const config = this.el.config;

    // load default plugins on
    if (config.plugins.default) {
      config.plugins.default.forEach((name: string) => {
        const plugin = require(`./plugins/${name}`).default;
        this.use(plugin);
      });
    }

    // load custom plugins on
    if (config.plugins.custom) {
      config.plugins.custom.forEach((name: string) => {
        const plugin = require(`../config/custom/plugins/${name}`).default;
        this.use(plugin);
      });
    }

    log.info('插件加载完毕');
  }

  /**
   * 使用插件
   * @param plugin 
   */
  use(plugin: Function) {
    plugin(this);
  }

  /**
   * 开始监听，并加载插件
   */
  listen() {
    this.loadPlugins();
    this.mirai.listen();

    process.on("exit", () => {
      log.info("主人再见");
      this.mirai.release();
    });
  }
};
