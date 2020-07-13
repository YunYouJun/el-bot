import Mirai, { MiraiApiHttpConfig, MiraiInstance } from "mirai-ts";
import log from "mirai-ts/dist/utils/log";
import { El, Bot } from "..";
import { tryCatch } from "./utils/decorators";

import loki from "lokijs";

export default class ElBot {
  el: El;
  mirai: MiraiInstance;
  // 激活
  active: boolean;
  plugins: Bot.Plugins;
  /**
   * 本地数据库
   */
  db: LokiConstructor;
  constructor(el: El) {
    const mahConfig: MiraiApiHttpConfig = {
      host: el.setting.host || "localhost",
      port: el.setting.port || 8080,
      authKey: el.setting.authKey || "el-psy-congroo",
      enableWebsocket: el.setting.enableWebsocket || false,
    };
    this.el = el;
    this.mirai = new Mirai(mahConfig);
    this.active = true;
    this.plugins = {
      default: [],
      community: [],
      custom: []
    };
    // 初始化本地数据库
    this.db = new loki(this.el.config.db_path, {
      autoload: true,
      verbose: true,
      autosave: true
    });
  }

  @tryCatch()
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

          let pkg = {
            version: "未知",
            description: "未知"
          };
          try {
            pkg = require(`${path}/${name}/package.json`);
          } catch {
            if (type !== 'default') {
              log.warning(`${name} 插件没有相关描述信息`);
            }
          }

          if (plugin) {
            this.plugins[type].push({
              name,
              version: plugin.version || pkg.version,
              description: plugin.description || pkg.description
            });
            this.use(plugin);
          };
        } catch (error) {
          console.log(error);
          log.error(`插件 ${name} 加载失败`);
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
    this.loadPlugins('community', '../packages/el-bot-plugins');
    this.loadPlugins('custom', '../config/custom/plugins');

    this.mirai.listen();

    process.on("exit", () => {
      log.info("Bye, Master!");
      this.mirai.release();
    });
  }
};
