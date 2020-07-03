import log from "mirai-ts/dist/utils/log";
import pkg from "../../package.json";
import shell from "shelljs";
import { MessageType } from "mirai-ts";
import ElBot from "../bot";
import { bot } from "../../index";
import { isAllowed } from "../utils/global";

// change it in onMessage
let reply: Function = (msg: string | MessageType.MessageChain) => {
  console.log(msg);
};

let qq: number = 0;

const yargs = require("yargs")
  .scriptName("el")
  .usage("Usage: $0 <command> [options]")
  .command("echo <message>", "回声", {}, (argv: any) => {
    reply(argv.message);
  })
  .command("sleep", "休眠", async () => {
    if (!isAllowed(qq)) {
      await reply("您没有操作权限");
      return;
    }
    // todo
    bot.active = false;
    reply("进入休眠状态");
  })
  .command("restart", "重启机器人", async () => {
    if (isAllowed(qq)) {
      await reply("重启 el-bot-js");
      shell.exec("touch index.js");
    } else {
      await reply("您没有操作权限");
    }
  })
  .command("restart:mirai", "重启 mirai-console", async () => {
    if (!isAllowed(qq)) {
      await reply("您没有操作权限");
      return;
    }

    await reply("重启 mirai-console");

    const consolePid: number = parseInt(
      shell.exec("pgrep -f java -jar ./mirai-console-wrapper --update STABLE", {
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


export default function (ctx: ElBot) {
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
