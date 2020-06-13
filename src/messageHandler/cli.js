const log = require("../../lib/chalk");
const pkg = require("../../package.json");
const { Command } = require("commander");

module.exports = class Cli {
  constructor(msg) {
    const program = new Command();
    this.program = program;
    const reply = msg.reply;
    this.reply = reply;

    // 避免打印版本退出
    program.exitOverride();

    program
      .version(pkg.version, "-V, --version", "当前版本（控制台）")
      .option("-d, --debug", "调试模式")
      .option("-a, --about", "关于咱们");

    program.helpOption("-h, --help", "帮助信息（控制台）");

    program
      .name("el")
      .command("version")
      .description("当前版本")
      .action(() => {
        reply("v" + pkg.version);
      });

    program
      .command("echo <message>")
      .description("回声测试")
      .action((message) => {
        reply(message);
      });

    program
      .command("help")
      .description("帮助说明")
      .action(() => {
        reply(program.helpInformation());
      });
  }

  parse(cmd) {
    try {
      // 我也不知道为什么 commander 为何从第二个参数才开始解析
      cmd.unshift("");
      this.program.parse(cmd);
    } catch (err) {}

    this.handle();
  }

  handle() {
    const program = this.program;
    const reply = this.reply;

    let info = "";
    if (program.debug) {
      info = "调试模式";
      log.info(info);
      reply(info);
    } else if (program.about) {
      reply("GitHub: " + pkg.homepage);
    }

    this.reset();
  }

  reset() {
    this.program.version = undefined;
    this.program.debug = undefined;
    this.program.about = undefined;
  }
};
