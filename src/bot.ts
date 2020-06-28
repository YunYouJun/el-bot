import Mirai, { MiraiApiHttpConfig, MiraiInstance } from "mirai-ts";
import log from "mirai-ts/dist/utils/log";
import { El } from "..";

export default class ElBot {
  el: El;
  mirai: MiraiInstance;
  // 激活
  active: boolean;

  constructor(el: El) {
    const mahConfig: MiraiApiHttpConfig = {
      host: el.setting.host || "localhost",
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
          if (plugin) this.use(plugin);
        } catch (error) {
          console.log(error);
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
    this.loadPlugins('community', '../packages/el-bot-js-plugins');
    this.loadPlugins('custom', '../config/custom/plugins');

    this.mirai.listen();

    process.on("exit", () => {
      log.info("主人再见");
      this.mirai.release();
    });
  }
};
