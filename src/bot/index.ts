import El from "../el";
import Mirai, { MiraiApiHttpConfig, MiraiInstance } from "mirai-ts";
import { log } from "mirai-ts";
import loki from "lokijs";

import Sender from "./sender";
import User from "./user";
import Status from "./status";
import Plugins from "./plugins";
import cac, { CAC } from "cac";

import { sleep } from "../utils/misc";

interface PackageJson {
  name: string;
  version: string;
  [propName: string]: any;
}

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
  pkg: PackageJson;
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
  /**
   * 指令系统
   */
  cli: CAC;
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
    this.cli = cac("el");
  }

  /**
   * 加载自定义函数插件
   */
  use(name: string, plugin: Function) {
    this.plugins.use(name, plugin);
  }

  /**
   * 自动重连
   */
  async link() {
    try {
      await this.mirai.link(this.el.qq);
    } catch (err) {
      console.log(err.message);
      await sleep(3000);
      log.warning("尝试重新连接...");
      await this.link();
    }
  }

  /**
   * 启动机器人
   * @param callback 回调函数
   */
  async start(callback?: Function) {
    // 链接 QQ
    log.info("Link Start! " + this.el.qq);
    await this.link();

    // 加载插件
    this.plugins.load("default");
    this.plugins.load("official");
    this.plugins.load("community");

    callback ? this.mirai.listen(callback) : this.mirai.listen();

    // 推出信息
    process.on("exit", () => {
      log.warning("Bye, Master!");
      this.mirai.release();
    });
  }
}
