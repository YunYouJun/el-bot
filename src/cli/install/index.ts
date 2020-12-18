import inquirer from "inquirer";
import { log } from "mirai-ts";
import Repo from "./repo";
import shell from "shelljs";
import commander from "commander";

export default function (cli: commander.Command) {
  cli
    .command("install [project]")
    .description("安装依赖")
    .alias("i")
    .action((project: string) => {
      if (project === "mirai") {
        installMirai();
      }
    });
}

/**
 * 安装 mirai
 */
function installMirai() {
  log.warning(
    "由于种种原因，本项目只使用原生脚本启动 mirai。\n这只是辅助，你完全可以自行启动 mirai 而无需使用它。"
  );
  log.info(
    "\nel-bot 基于 mirai-api-http 且专注于机器人本身逻辑，但不提供任何关于如何下载启动 mirai 的解答，你应该自行掌握如何使用 mirai。\n在使用 el-bot 过程中遇到的问题，欢迎提 ISSUE，或加入我们的 QQ群 : 707408530 / TG群: https://t.me/elpsy_cn。"
  );
  log.warning("也许你可以在群内发现一些你需要的文件。");

  inquirer
    .prompt([
      {
        type: "confirm",
        name: "mirai-api-http",
        message: "是否下载最新版本 mirai-api-http？（使用 el-bot 务必安装！）",
      },
      {
        type: "confirm",
        name: "copy-setting",
        message:
          "是否拷贝默认配置？（你可以前往 `./mcl/config/MiraiApiHttp/setting.yml` 进行修改。）",
      },
    ])
    .then((answers) => {
      const tooltip =
        "可以从群文件中下载 mirai-api-http-*.jar，手动放置到 /plugins 目录下。";

      if (answers["mirai-api-http"]) {
        const miraiApiHttp = new Repo("project-mirai", "mirai-api-http");
        log.info(`若下载较慢，${tooltip}`);
        miraiApiHttp.downloadLatestRelease("./mirai/plugins");
      }

      if (answers["copy-setting"]) {
        shell.exec(
          "cp ./mcl/config/MiraiApiHttp/setting.example.yml ./mcl/config/MiraiApiHttp/setting.yml"
        );
      }
    });
}
