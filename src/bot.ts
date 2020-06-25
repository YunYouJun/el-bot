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
   * 加载对应类型插件
   * @param type 插件类型 default | custom
   * @param path 所在路径
   */
  loadPlugins(type: string, path: string) {
    const config = this.el.config;
    if (config.plugins[type]) {
      config.plugins[type].forEach((name: string) => {
        try {
          const plugin = require(`${path}/${name}`).default;
          this.use(plugin);
        } catch (error) {
          console.log(`插件 ${name} 加载失败`);
        }
      });
    }
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
    this.loadPlugins('default', './plugins');
    this.loadPlugins('custom', '../config/custom/plugins');

    this.mirai.listen();

    process.on("exit", () => {
      log.info("主人再见");
      this.mirai.release();
    });
  }
};
