const log = require("../../lib/chalk");
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
  .command("restart", "重启", () => {
    reply("触发重启操作");
    shell.exec("touch index.js");
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
