import El from "../config/el";
import Mirai, {
  MessageType,
  MiraiApiHttpConfig,
  MiraiInstance,
} from "mirai-ts";

import Sender from "./sender";
import User from "./user";
import Status from "./status";
import Plugins from "./plugins";
import { Command } from "./command";
import { createLogger } from "./logger";
import Webhook from "./webhook";
import { initCli } from "./cli";

import { getAllPlugins, sleep, statement } from "../utils/misc";
import { connectDb } from "../db";
import chalk from "chalk";
import commander from "commander";
import mongoose from "mongoose";
import { Server } from "net";
// shared
import { isFunction } from "../shared";

// node
import fs from "fs";

// type
import { Plugin } from "./plugins";
import { resolve } from "path";

/**
 * 创建机器人
 * @param el
 */
export function createBot(el: El) {
  return new Bot(el);
}

export default class Bot {
  el: El;
  mirai: MiraiInstance;
  // 激活
  active = true;
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
   * 已安装的插件
   */
  installedPlugins = new Set();
  /**
   * 面向开发者的指令系统
   */
  cli: commander.Command;
  /**
   * 面向用户的指令系统
   */
  _command: Command;
  /**
   * 日志系统
   */
  logger = createLogger("el-bot");
  webhook?: Webhook;
  /**
   * 是否开发模式下
   */
  isDev = process.env.NODE_ENV !== "production";
  rootDir = process.cwd();
  tmpDir = "tmp/";
  isTS = fs.existsSync(resolve(this.rootDir, "tsconfig.json"));
  constructor(el: El) {
    this.el = new El(el);
    const setting = this.el.setting as MiraiApiHttpConfig;
    const mahConfig: MiraiApiHttpConfig = {
      host: setting.host || "localhost",
      port: setting.port || 8080,
      authKey: setting.authKey || "el-psy-congroo",
      enableWebsocket: setting.enableWebsocket || false,
    };
    this.mirai = new Mirai(mahConfig);
    this.status = new Status(this);
    this.user = new User(this);
    this.sender = new Sender(this);
    this.plugins = new Plugins(this);
    this._command = new Command(this);
    if (this.el.webhook && this.el.webhook.enable) {
      this.webhook = new Webhook(this);
    }
    this.cli = initCli(this, "el");

    // report error to qq
    if (this.el.report?.enable) {
      const logError = this.logger.error;
      this.logger.error = (...args: any) => {
        const target = this.el.report?.target || {};
        if (this.el.bot.devGroup) {
          if (target?.group) {
            target.group.push(this.el.bot.devGroup);
          } else {
            target.group = [this.el.bot.devGroup];
          }
        }
        this.sender.sendMessageByConfig(args.join(" "), target);
        return logError(args[0], ...args.slice(1));
      };
    }
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
   * 自动重连
   */
  async link() {
    try {
      const data = await this.mirai.link(this.el.qq);
      return data;
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
    if (this.el.db?.enable) {
      await connectDb(this, this.el.db);
    }

    // 链接 QQ
    if (!this.el.qq) {
      this.logger.error("未传入机器人 QQ");
      return;
    }

    this.logger.info(`Bot QQ: ` + chalk.green(this.el.qq));
    this.logger.info(`Link Start!`);

    // link
    const data = await this.link();
    if (data?.code !== 0) {
      this.logger.error("无法正确链接您的 QQ，请检查 QQ 是否正确！");
      return;
    }

    // mah about
    try {
      const { data } = await this.mirai.api.about();
      this.logger.info(`[mah] version: ${data.version}`);
    } catch (e) {
      console.error(e);
      this.logger.error(
        "未检测到 mirai-api-http 版本，请检查是否已与 mah 建立链接！"
      );
      return;
    }

    // 加载插件
    this.logger.info("开始加载插件");
    this.plugins.load("default");
    this.plugins.load("official");
    this.plugins.load("community");

    if (this.el.bot.autoloadPlugins) {
      const allCustomPlugins = getAllPlugins(
        resolve(this.rootDir, "./plugins")
      );
      this.el.bot.plugins!.custom = allCustomPlugins.map((path) =>
        resolve((this.isTS ? "dist/" : "") + "plugins", path)
      );
    }

    this.plugins.load("custom");

    this.mirai.listen();

    // 监听并解析用户指令
    this._command.listen();

    // 启动 webhook
    let server: Server | undefined;
    if (this.el.webhook && this.el.webhook.enable) {
      try {
        server = this.webhook?.start();
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
      if (this.el.webhook && this.el.webhook.enable) {
        if (server) {
          server.close();
          this.logger.info("[webhook] 关闭 Server");
        }
      }

      this.logger.warning("Bye, Master!");
      this.mirai.release();
    });
  }

  /**
   * 加载自定义函数插件（但不注册）
   * 注册请使用 .plugin
   * 与 this.plugin.use() 的区别是此部分的插件将不会显示在插件列表中
   */
  use(plugin: Plugin, ...options: any[]) {
    const installedPlugins = this.installedPlugins;
    if (installedPlugins.has(plugin)) {
      this.isDev && this.logger.warn("插件已经被安装");
    } else if (plugin && isFunction(plugin.install)) {
      installedPlugins.add(plugin);
      plugin.install(this, ...options);
    } else if (isFunction(plugin)) {
      installedPlugins.add(plugin);
      plugin(this, ...options);
    } else if (this.isDev) {
      this.logger.warn('插件必须是一个函数，或是带有 "install" 属性的对象。');
    }
    return this;
  }

  /**
   * 注册插件
   * @param name 插件名称
   * @param plugin 插件函数
   * @param options 插件选项
   */
  plugin(name: string, plugin: Plugin, ...options: any[]) {
    this.plugins.add(name, plugin, ...options);
    this.plugins["custom"].add({
      name,
    });
  }

  /**
   * 注册指令（面向用户）
   */
  command(name: string) {
    return this._command.command(name);
  }
}
