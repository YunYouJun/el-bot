require("dotenv").config();
const glob = require("glob");
const { spawn } = require("child_process");
const log = require("mirai-ts/dist/utils/log").default;

glob("./mirai-console-wrapper-*.jar", {}, (err, files) => {
  if (err) console.log(err);

  const miraiConsole = spawn("java", ["-jar", files[0]], {
    stdio: ["pipe", "inherit", "inherit"],
  });

  // pipe console cmd
  process.stdin.pipe(miraiConsole.stdin);
  if (process.env.BOT_QQ && process.env.BOT_PASSWORD) {
    setTimeout(() => {
      log.info("自动登录 QQ");
      const loginCmd = `login ${process.env.BOT_QQ} ${process.env.BOT_PASSWORD}\n`;
      console.log(loginCmd);
      miraiConsole.stdin.write(loginCmd);
    }, 3000);
  }
});
