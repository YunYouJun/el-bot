import { CAC } from "cac";
import inquirer from "inquirer";
import download from "download";
import { log } from "mirai-ts";
import Repo from "./repo";

export default function (cli: CAC) {
  cli.command('install [project]', '安装依赖')
    .alias('i')
    .action((project: string, options: WorkerOptions) => {
      if (project === 'mirai') {
        installMirai();
      }
    });
}

/**
 * 安装 mirai
 */
function installMirai() {
  inquirer
    .prompt([
      {
        type: "rawlist",
        name: "mirai",
        message:
          "您想要安装什么版本的 MiraiOK（https://github.com/LXY1226/miraiOK）？",
        choices: [
          {
            name: "Linux-amd64: 服务器（大多数是这个）",
            value: "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_linux_amd64",
          },
          {
            name: "Linux-arm64: 64位 arm 系",
            value: "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_linux_arm64",
          },
          {
            name: "Linux-arm: arm 系",
            value: "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_linux_arm",
          },
          {
            name: "Windows-386: mirai-native 用（el-bot 没用 mirai-native）",
            value:
              "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_windows_386.exe",
          },
          {
            name: "Windows-amd64: 不用 native （Windows 用户大部分是这个）",
            value:
              "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_windows_amd64.exe",
          },
          {
            name: "Darwin-amd64: macOS （你还有的选吗？）",
            value: "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_darwin_amd64",
          },
        ],
      },
      {
        type: "confirm",
        name: "mirai-api-http",
        message: "是否下载最新版本 mirai-api-http？（使用 el-bot 务必安装！）",
      },
    ])
    .then((answers) => {
      const tooltip = "可以到 707408530 群文件下载 mirai-api-http-*.jar，手动放置到 /plugins 目录下。";

      try {
        download(answers.mirai, "./mirai");
      } catch (err) {
        console.log(err);
        log.error(
          `下载失败（应该是国内行情导致的网络问题），${tooltip}`
        );
      }

      if (answers["mirai-api-http"]) {
        const miraiApiHttp = new Repo("project-mirai", "mirai-api-http");
        log.info(`若下载较慢，${tooltip}`);
        miraiApiHttp.downloadLatestRelease("./mirai/plugins");
      }
    });
}

