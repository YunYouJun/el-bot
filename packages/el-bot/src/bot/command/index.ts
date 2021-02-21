import Bot from "el-bot";
import { check } from "mirai-ts";
import { getHelpContent } from "./utils";

/**
 * 面向用户的指令
 */
export class Command {
  /**
   * 指令名称
   */
  name = "";
  /**
   * 指令描述
   */
  desc = "";
  /**
   * 回调函数
   */
  callback = (options: string[]) => {
    console.log(options);
  };
  children = new Map<string, Command>();

  constructor(public ctx: Bot) {}

  /**
   * 注册指令
   * @param name
   */
  command(name: string) {
    this.name = name;

    return this;
  }

  /**
   * 命令描述
   * @param desc
   */
  description(desc: string) {
    this.desc = desc;
    return this;
  }

  /**
   * 只有有回调执行操作的命令才会被加入 command 列表
   * @param callback
   */
  action(callback: (options: string[]) => any) {
    this.callback = callback;
    if (this.children.has(this.name)) {
      this.ctx.logger.error(`指令【${this.name}】已存在`);
    } else {
      this.children.set(this.name, this);
      this.name = "";
      this.desc = "";
    }
    return this;
  }

  parse(text: string) {
    const cmds = text.split(" ");
    const filteredCmds = cmds.filter((cmd) => cmd !== "");

    const cmdKey = filteredCmds[0];
    if (this.children.has(cmdKey)) {
      const command = this.children.get(cmdKey);
      if (command) {
        command.callback(filteredCmds.slice(1));
      } else {
        this.ctx.logger.warn(`指令【${cmdKey}】的行为未定义`);
      }
    }
  }

  listen() {
    const { mirai } = this.ctx;
    mirai.on("message", (msg) => {
      if (check.isAt(msg, this.ctx.el.qq) && msg.plain.trim() === "帮助") {
        const content = getHelpContent(this.children);
        msg.reply(content);
        return;
      }

      this.parse(msg.plain.trim());
    });
  }
}
