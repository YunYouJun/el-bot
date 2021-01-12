import Bot from "src";
import commander, { Command } from "commander";
import { PluginType } from "../plugins";
import { ChatMessage } from "mirai-ts/dist/types/message-type";
import shell from "shelljs";
import { cleanOptions } from "./utils";

/**
 * 处理全局选项
 * @param options
 * @param ctx
 */
async function processOptions(program: commander.Command, ctx: Bot) {
  const options = program.opts();

  const pkg = ctx.el.pkg;

  if (options.v || options.version) {
    ctx.reply(`el-bot: v${pkg.version}`);

    const mahAbout = await ctx.mirai.api.about();
    ctx.reply(`mirai-api-http: v${mahAbout.data.version}`);
  }

  // about
  if (options.a || options.about) {
    let about = "";
    about += "GitHub: " + pkg.repository.url + "\n";
    about += "Docs: " + pkg.homepage + "\n";
    about += "SDK: " + pkg.directories.lib + "\n";
    about += "Author: " + `${pkg.author.name} <${pkg.author.url}>` + "\n";
    about += "Copyright: @ElpsyCN";
    ctx.reply(about);
  }
}

export function initCli(ctx: Bot, name: string) {
  const { mirai } = ctx;

  // modify prototype
  Command.prototype.outputHelp = function (cb: any) {
    if (!cb) {
      cb = (passthru: any) => {
        return passthru;
      };
    }
    const cbOutput = cb(this.helpInformation());
    const command = (ctx.mirai.curMsg as ChatMessage).plain.trim();
    if (
      cbOutput &&
      (this.parent || command === "el -h" || command === "el --help")
    ) {
      ctx.reply(cbOutput.trim());
    }
    this.emit(this._helpLongFlag);
  };

  const cli = new Command("el");
  const program = cli;
  program.exitOverride();

  // default global option
  program.option("-v", "版本").option("-a, --about", "关于");

  // 重启机器人
  program
    .command("restart")
    .description("重启 el-bot")
    .action(async () => {
      if (ctx.user.isAllowed(undefined, true)) {
        await ctx.reply("重启 el-bot");
        shell.exec("touch package.json");
      }
    });

  // 回声测试
  program
    .command("echo <message>")
    .description("回声")
    .action((message) => {
      console.log(message);
      if (ctx.user.isAllowed(undefined, true)) {
        ctx.reply(message);
      }
    });

  // 插件
  program
    .command("plugins")
    .description("插件列表")
    .option("-l, --list <type>", "插件列表", "all")
    .action((options) => {
      let pluginsTypeArray = ["default", "official", "community", "custom"];

      if (options.list) {
        if (!pluginsTypeArray.concat("all").includes(options.list)) {
          ctx.reply(
            `类型不合法，应当是 ${pluginsTypeArray.concat("all")} 中的一个。`
          );
          return;
        }

        if (options.list !== "all") {
          pluginsTypeArray = [options.list];
        }

        let content = "";
        pluginsTypeArray.forEach((type) => {
          content += ctx.plugins.list(type as PluginType);
        });

        ctx.reply(content.slice(0, -1));
      }
    });

  mirai.on("message", (msg) => {
    // qq = msg.sender.id;
    if (msg.plain.slice(0, name.length) !== name) return;
    if (msg.plain[name.length] !== " ") return;

    try {
      const cmd = msg.plain.split(" ");
      cmd.shift();
      program.parse(cmd, { from: "user" });
    } catch (err) {
      if (err.code !== "commander.help" && err.exitCode) {
        ctx.logger.error(`[cli] ${msg.plain}`);
        ctx.reply(err.message);
      }
    }
    processOptions(program, ctx);
    cleanOptions(program);
  });

  return program;
}
