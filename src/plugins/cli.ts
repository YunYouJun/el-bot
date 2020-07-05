import log from "mirai-ts/dist/utils/log";
import pkg from "../../package.json";
import shell from "shelljs";
import { MessageType } from "mirai-ts";
import ElBot from "../bot";
import { el, bot } from "../../index";
import { isAllowed } from "../utils/global";
import { Bot } from "../..";

// change it in onMessage
let reply: Function = (msg: string | MessageType.MessageChain) => {
  console.log(msg);
};

const config = el.config;
let qq: number = 0;

interface Job {
  name: string;
  do: string[];
}

interface Step {
  cmd: string;
  async: boolean;
}

/**
 * 执行对应任务
 * @param jobs 
 * @param name 
 */
function doJobByName(jobs: Job[], name: string) {
  jobs.forEach((job: Job) => {
    if (job.name && job.name === name && job.do) {
      job.do.forEach((step: string | Step) => {
        let cmd = '';
        let async = false;
        if (typeof step === "string") {
          cmd = step;
        } else {
          cmd = step.cmd;
          async = step.async;
        }
        if (cmd.includes("el run ")) {
          name = cmd.slice(7);
          doJobByName(jobs, name);
        }
        shell.exec(cmd, {
          async
        });
      });
    }
  });
}

function listPlugins(type: string, name: string) {
  let content = name + ':\n';
  bot.plugins[type].forEach((plugin: Bot.Plugin) => {
    content += `- ${plugin.name}@${plugin.version}: ${plugin.description}\n`;
  });
  return content;
}

const yargs = require("yargs")
  .scriptName("el")
  .usage("Usage: $0 <command> [options]")
  .command("echo <message>", "回声", {}, async (argv: any) => {
    if (!isAllowed(qq)) {
      await reply("您没有操作权限");
      return;
    }

    reply(argv.message);
  })
  .command("run <name>", "运行自定义任务", {}, async (argv: any) => {
    if (!isAllowed(qq)) {
      await reply("您没有操作权限");
      return;
    }

    if (config.cli && config.cli.jobs && config.cli.jobs.length > 0) {
      doJobByName(config.cli.jobs, argv.name);
    }
  })
  .command("jobs", "任务列表", {}, async () => {
    if (!isAllowed(qq)) {
      await reply("您没有操作权限");
      return;
    }

    let content = '任务列表：';
    config.cli.jobs.forEach((job: Job) => {
      if (job.name) {
        content += '\n- ' + job.name;
      }
    });
    reply(content);
  })
  .command("plugins", "插件列表", {}, async () => {
    let content = '';

    if (config.plugins['default']) {
      content += listPlugins('default', '默认插件');
    }
    if (config.plugins['community']) {
      content += listPlugins('community', '社区插件');
    }
    if (config.plugins['custom']) {
      content += listPlugins('custom', '自定义插件');
    }
    reply(content.slice(0, -1));
  })
  .command("sleep", "休眠", {}, async () => {
    if (!isAllowed(qq)) {
      await reply("您没有操作权限");
      return;
    }
    // todo
    bot.active = false;
    reply("进入休眠状态");
  })
  .command("restart", "重启机器人", {}, async () => {
    if (isAllowed(qq)) {
      await reply("重启 el-bot-js");
      shell.exec("touch index.js");
    } else {
      await reply("您没有操作权限");
    }
  })
  .command("restart:mirai", "重启 mirai-console", {}, async () => {
    if (!isAllowed(qq)) {
      await reply("您没有操作权限");
      return;
    }

    await reply("重启 mirai-console");

    const consolePid: number = parseInt(
      shell.exec("pgrep -f ./miraiOK_", {
        silent: true,
      }).stdout
    );
    const scriptPid: number = parseInt(
      shell.exec("pgrep -f start:mirai", {
        silent: true,
      }).stdout
    );
    process.kill(consolePid);
    process.kill(scriptPid);

    shell.exec("npm run start:mirai", (code, stdout, stderr) => {
      console.log("Exit code:", code);
      console.log("Program output:", stdout);
      console.log("Program stderr:", stderr);
    });

    setTimeout(() => {
      shell.exec("touch index.js");
    }, 5000);
  })
  .option("about", {
    alias: "a",
    describe: "关于",
    demandOption: false,
  })
  .alias("version", "v")
  .alias("help", "h")
  .locale("zh_CN");

function parse(cmd: string[]) {
  yargs.parse(cmd, (err: any, argv: any, output: string) => {
    if (err) log.error(err);

    if (output) reply(output);

    // handle
    if (argv.about) {
      let about = '';
      about += "GitHub: " + pkg.repository.url + '\n';
      about += "Docs: " + pkg.homepage + '\n';
      about += "SDK: " + pkg.directories.lib + '\n';
      about += "Author: " + `${pkg.author.name} <${pkg.author.url}>` + '\n';
      about += "Contributors: " + pkg.contributors[0] + ' ' + pkg.contributors[1] + '\n';
      about += 'Copyright: @ElpsyCN';
      reply(about);
    }
  });
}

cli.version = "0.0.1";
cli.description = "交互终端";

export default function cli(ctx: ElBot) {
  const mirai = ctx.mirai;

  mirai.on('message', (msg: MessageType.SingleMessage) => {
    if (!msg.sender) return;
    qq = msg.sender.id;
    reply = msg.reply;

    // command for message
    if (msg.plain.slice(0, 2) === "el") {
      const cmd: string[] = msg.plain.split(" ").filter((item: string) => {
        return item !== "";
      });
      // remve "el"
      parse(cmd.slice(1));
    }
  });
};

