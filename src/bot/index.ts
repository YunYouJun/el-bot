import El from "../el";
import Mirai, { MiraiApiHttpConfig, MiraiInstance } from "mirai-ts";

import Sender from "./sender";
import User from "./user";
import Status from "./status";
import Plugins from "./plugins";
import cac, { CAC } from "cac";

import { sleep, statement } from "../utils/misc";
import { Logger } from "./logger";
import { Db, MongoClient } from "mongodb";
import { connectDb } from "./db";
import chalk from "chalk";

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
  client?: MongoClient;
  /**
   * 数据库，默认使用 MongoDB
   */
  db?: Db;
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
  /**
   * 日志系统
   */
  logger: Logger;
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
    this.pkg = require("../../package.json");
    this.active = true;
    this.status = new Status(this);
    this.user = new User(this);
    this.sender = new Sender(this);
    this.plugins = new Plugins(this);
    this.logger = new Logger();
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
      this.logger.warning("尝试重新连接...");
      await this.link();
    }
  }

  /**
   * 启动机器人
   * @param callback 回调函数
   */
  async start(callback?: Function) {
    statement(this);

    // 链接 QQ
    if (!this.el.qq) {
      this.logger.error("未传入机器人 QQ");
      return;
    }

    this.logger.info(`Bot QQ: ` + chalk.green(this.el.qq));
    this.logger.info(`Link Start!`);
    await this.link();

    // 连接数据库
    if (this.el.db.enable) {
      await connectDb(this, this.el.db);
    }

    // 加载插件
    this.plugins.load("default");
    this.plugins.load("official");
    this.plugins.load("community");
    this.plugins.load("custom");

    callback ? this.mirai.listen(callback) : this.mirai.listen();

    // 推出信息
    process.on("exit", () => {
      this.logger.warning("Bye, Master!");
      this.mirai.release();

      // 关闭数据库连接
      if (this.client) {
        this.client.close();
      }
    });
  }
}
