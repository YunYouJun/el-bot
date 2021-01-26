import El from "../el";
import Mirai, {
  MessageType,
  MiraiApiHttpConfig,
  MiraiInstance,
} from "mirai-ts";

import Sender from "./sender";
import User from "./user";
import Status from "./status";
import Plugins from "./plugins";
import { createLogger } from "./logger";
import Webhook from "./webhook";
import { initCli } from "./cli";

import { sleep, statement } from "../utils/misc";
import { connectDb } from "../db";
import chalk from "chalk";
import commander from "commander";
import mongoose from "mongoose";
import { Server } from "net";

export default class Bot {
  el: El;
  mirai: MiraiInstance;
  // 激活
  active: boolean;
  /**
   * 数据库，默认使用 MongoDB
   */
  db?: mongoose.Connection;
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
  cli: commander.Command;
  /**
   * 日志系统
   */
  logger = createLogger("el-bot");
  webhook: Webhook;
  /**
   * 是否开发模式下
   */
  isDev: boolean;
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
    this.status = new Status(this);
    this.user = new User(this);
    this.sender = new Sender(this);
    this.plugins = new Plugins(this);
    this.webhook = new Webhook(this);
    this.cli = initCli(this, "el");

    this.isDev = process.env.NODE_ENV === "dev";
  }

  /**
   * 机器人当前消息 快捷回复
   */
  reply(msgChain: string | MessageType.MessageChain, quote = false) {
    if (this.mirai.curMsg && this.mirai.curMsg.reply) {
      return this.mirai.curMsg.reply(msgChain, quote);
    } else {
      this.logger.error("当前消息不存在");
      return false;
    }
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
      this.logger.error(err.message);
      await sleep(3000);
      this.logger.warning("尝试重新连接...");
      await this.link();
    }
  }

  /**
   * 启动机器人
   * @param callback 回调函数
   */
  async start() {
    if (!this.isDev) {
      statement(this);
    }

    // 连接数据库
    if (this.el.db.enable) {
      await connectDb(this, this.el.db);
    }

    // 链接 QQ
    if (!this.el.qq) {
      this.logger.error("未传入机器人 QQ");
      return;
    }

    this.logger.info(`Bot QQ: ` + chalk.green(this.el.qq));
    this.logger.info(`Link Start!`);
    await this.link();

    // 加载插件
    this.plugins.load("default");
    this.plugins.load("official");
    this.plugins.load("community");
    this.plugins.load("custom");

    this.mirai.listen();

    // 启动 webhook
    let server: Server | undefined;
    if (this.el.webhook.enable) {
      try {
        server = this.webhook.start();
      } catch (err) {
        this.logger.error(err.message);
      }
    }

    // 退出信息
    process.on("exit", () => {
      // 关闭数据库连接
      if (this.db) {
        this.db.close();
        this.logger.info("[db] 关闭数据库连接");
      }

      // close koa server
      if (this.el.webhook.enable) {
        if (server) {
          server.close();
          this.logger.info("[webhook] 关闭 Server");
        }
      }

      this.logger.warning("Bye, Master!");
      this.mirai.release();
    });
  }
}
