import { resolve } from "path";
import shell from "shelljs";
import fs from "fs";
import { log } from "mirai-ts";
import { spawn } from "child_process";
import glob from "glob";
import commander from "commander";
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
 * 启动 MCL
 */
function startMcl(folder?: string) {
  require("dotenv").config();

  // 先进入目录
  try {
    shell.cd(folder || (pkg.mcl ? pkg.mcl.folder : "mcl"));
  } catch (err) {
    console.log(err);
    log.error("mcl 目录不存在");
  }

  glob("./mcl", {}, (err, files) => {
    if (err) console.log(err);

    if (files[0]) {
      try {
        const miraiConsole = spawn("./mcl", [], {
          stdio: ["pipe", "inherit", "inherit"],
        });
        process.stdin.pipe(miraiConsole.stdin);
      } catch (err) {
        console.log(err);
      }
    } else {
      log.error(
        "请下载官方启动器 [mirai-console-loader](https://github.com/iTXTech/mirai-console-loader)。"
      );
    }
  });
}

export default function (cli: commander.Command) {
  // 启动
  cli
    .command("start [project]")
    .description("启动 el-bot")
    .option("-f --folder", "mirai 所在目录")
    .action((project, options) => {
      if (!project || project === "bot") {
        startBot();
      } else if (project === "mcl") {
        startMcl(options.folder);
      } else {
        console.error("不存在该指令");
      }
    });
}
