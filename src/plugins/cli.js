import log from "../utils/chalk";
const pkg = require("../../package.json");
const shell = require("shelljs");

// change it in onMessage
let reply = {};

const yargs = require("yargs")
  .scriptName("el")
  .usage("Usage: $0 <command> [options]")
  .command("echo <message>", "回声", {}, (argv) => {
    reply(argv.message);
  })
  .command("sleep", "休眠", () => {
    global.el.active = false;
    reply("进入休眠状态");
  })
  .command("restart", "重启机器人", async () => {
    await reply("重启 el-bot-js");
    shell.exec("touch index.js");
  })
  .command("restart:console", "重启 mirai-console", async () => {
    await reply("重启 mirai-console");

    const consolePid = shell.exec(
      "pgrep -f java -jar ./mirai-console-wrapper",
      {
        silent: true,
      }
    ).stdout;
    const scriptPid = shell.exec("pgrep -f start:console", {
      silent: true,
    }).stdout;
    process.kill(consolePid);
    process.kill(scriptPid);

    shell.exec("npm run start:console", (code, stdout, stderr) => {
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

function parse(cmd) {
  yargs.parse(cmd, (err, argv, output) => {
    if (err) log.error(err);

    if (output) reply(output);

    // handle
    if (argv.about) {
      reply("GitHub: " + pkg.homepage);
    }
  });
}

function onMessage(msg) {
  const config = global.el.config;
  if (
    !config.master.includes(msg.sender.id) &&
    !config.admin.includes(msg.sender.id)
  ) {
    return;
  }

  reply = msg.reply;

  // command for message
  const cmd = msg.plain.split(" ").filter((item) => {
    return item !== "";
  });

  if (cmd[0] === "el") {
    // remve "el"
    parse(cmd.slice(1));
  }
}

module.exports = {
  onMessage,
};
