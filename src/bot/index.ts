import El from "../el";
import Mirai, { MiraiApiHttpConfig, MiraiInstance } from "mirai-ts";
import log from "mirai-ts/dist/utils/log";
import { tryCatch } from "@utils/decorators";
import loki from "lokijs";

import Sender from "./sender";
import User from "./user";
import Status from "./status";
import Plugins from "./plugins";


export default class Bot {
  el: El;
  mirai: MiraiInstance;
  // 激活
  active: boolean;
  /**
   * 本地数据库
   */
  db: LokiConstructor;
  /**
   * package.json
   */
  pkg: object;
  /**
   * 状态
   */
  status: Status;
  /**
   * 用户系统
   */
  user: User;
  /**
   * 发送器
   */
  sender: Sender;
  /**
 * 插件系统
 */
  plugins: Plugins;
  constructor(el: El) {
    this.el = new El(el);
    const setting = this.el.setting;
    const mahConfig: MiraiApiHttpConfig = {
      host: setting.host || "localhost",
      port: setting.port || 8080,
      authKey: setting.authKey || "el-psy-congroo",
      enableWebsocket: setting.enableWebsocket || false,
    };
    this.mirai = new Mirai(mahConfig);
    this.active = true;
    // 初始化本地数据库
    const db_path = this.el.config.db_path;
    this.db = new loki(db_path, {
      autoload: true,
      verbose: true,
      autosave: true,
    });
    this.pkg = require("../../package.json");
    this.status = new Status(this);
    this.user = new User(this);
    this.sender = new Sender(this);
    this.plugins = new Plugins(this);
  }

  @tryCatch()
  async init() {
    log.info("Link Start! " + this.el.qq);
    await this.mirai.login(this.el.qq);
  }

  /**
   * 开始监听，并加载插件
   */
  listen() {
    this.plugins.load("default", "../plugins");
    this.plugins.load("community", "../packages/el-bot-plugins");
    this.plugins.load("custom", "../config/custom/plugins");

    this.mirai.listen();

    process.on("exit", () => {
      log.info("Bye, Master!");
      this.mirai.release();
    });
  }

  /**
   * 启动机器人
   */
  async start() {
    await this.init();
    this.listen();
  }
}
