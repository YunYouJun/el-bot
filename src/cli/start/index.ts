import { CAC } from "cac";
import { resolve } from "path";
import shell from "shelljs";
import fs from "fs";
import { log } from "mirai-ts";
import { spawn } from "child_process";
import glob from "glob";
import { startWebhook } from "./webhook";
const pkg = require(getAbsolutePath("./package.json"));

/**
 * 获取当前目录下的绝对路径
 * @param file 文件名
 */
function getAbsolutePath(file: string) {
  return resolve(process.cwd(), file);
}

/**
 * 启动机器人
 */
function startBot() {
  const execFile = pkg.main || "index.js" || "index.ts";
  const file = getAbsolutePath(execFile);

  if (fs.existsSync(file)) {
    if (file.includes(".ts")) {
      spawn("ts-node", [file], { stdio: "inherit" });
    } else {
      spawn("node", [file], { stdio: "inherit" });
    }
    return true;
  } else {
    log.error(
      "不存在可执行文件，请检查 package.json 中 main 入口文件是否存在，或参考文档新建 index.js 机器人实例。"
    );
    return false;
  }
}

/**
 * 启动 mirai
 */
function startMirai(folder?: string) {
  // 先进入目录
  try {
    shell.cd(folder || pkg.mirai.folder || "mirai");
  } catch (err) {
    console.log(err);
    log.error("mirai 目录不存在");
  }

  glob("./mirai-console-wrapper-*.jar", {}, (err, files) => {
    if (err) console.log(err);

    if (files[0]) {
      try {
        const miraiConsole = spawn("java", ["-jar", files[0]], {
          stdio: ["pipe", "inherit", "inherit"],
        });
        process.stdin.pipe(miraiConsole.stdin);
        if (process.env.BOT_QQ && process.env.BOT_PASSWORD) {
          log.info("自动登录 QQ");
          const loginCmd = `login ${process.env.BOT_QQ} ${process.env.BOT_PASSWORD}\n`;
          console.log(loginCmd);
          miraiConsole.stdin.write(loginCmd);
        }
      } catch (err) {
        console.log(err);
      }
    } else {
      log.error("请先通过 npm run install:mirai 下载 mirai-console-wrapper。");
    }
  });
}

export default function (cli: CAC) {
  // 启动
  cli
    .command("start [project]", "启动 el-bot")
    .option("-f --folder", "mirai 所在目录")
    .action((project, options) => {
      if (!project) {
        const cwd = process.cwd();
        setTimeout(() => {
          // avoid disturb from Mirai
          shell.cd(cwd);
          startBot();
        }, 3000);
        startMirai(options.folder);
      } else if (project === "bot") {
        startBot();
      } else if (project === "mirai") {
        startMirai(options.folder);
      } else if (project === "webhook") {
        startWebhook();
      } else {
        log.error("你在教我做事？");
      }
    });
}
