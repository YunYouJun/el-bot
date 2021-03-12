import inquirer from "inquirer";
import { Logger } from "@yunyoujun/logger";
import Repo from "./repo";
import commander from "commander";
import fs from "fs";

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

const logger = new Logger({ prefix: "[cli(install)]" });

const settingPath = "./mcl/config/MiraiApiHttp/setting.yml";

function writeDefaultSetting() {
  const defaultSetting = `
cors:
  - "*"
host: 0.0.0.0
port: 4859
authKey: el-psy-congroo
cacheSize: 4096
enableWebsocket: true
report:
  enable: false
  groupMessage:
    report: true
  friendMessage:
    report: true
  tempMessage:
    report: true
  eventMessage:
    report: true
  destinations: []
  extraHeaders: {}

heartbeat:
  enable: false
  delay: 1000
  period: 15000
  destinations: []
  extraBody: {}

  extraHeaders: {}
`;
  fs.writeFileSync(settingPath, defaultSetting);
}

/**
 * 安装 mirai
 */
function installMirai() {
  logger.warning(
    "这只是 mirai-api-http 辅助的安装脚本，你完全可以自行启动 mirai 而无需使用它。(本脚本默认已将 mirai-console-loader 放置于当前 mcl 文件夹中。)"
  );
  logger.info(
    "推荐使用官方启动器 mirai-console-loader ( https://github.com/iTXTech/mirai-console-loader )"
  );
  logger.info(
    "\nel-bot 基于 mirai-api-http 且专注于机器人本身逻辑，但不提供任何关于如何下载启动 mirai 的解答，你应该自行掌握如何使用 mirai。\n在使用 el-bot 过程中遇到的问题，欢迎提 ISSUE，或加入我们的 QQ群 : 707408530 / TG群: https://t.me/elpsy_cn。"
  );

  inquirer
    .prompt([
      {
        type: "confirm",
        name: "mirai-api-http",
        message:
          "是否下载最新版本 mirai-api-http ( https://github.com/project-mirai/mirai-api-http/releases )？（使用 el-bot 务必安装！）",
      },
      {
        type: "confirm",
        name: "default-setting",
        message: `是否书写默认配置？（你可以前往 ${settingPath} 进行修改。）`,
      },
    ])
    .then((answers) => {
      const tooltip = "你也可以自行下载，手动放置到 /plugins 目录下。";

      if (answers["mirai-api-http"]) {
        const miraiApiHttp = new Repo("project-mirai", "mirai-api-http");
        logger.info(`若下载较慢，${tooltip}`);
        miraiApiHttp.downloadLatestRelease("./mcl/plugins");
      }

      if (answers["default-setting"]) {
        writeDefaultSetting();
      }
    });
}
