import { logger } from 'el-bot'

/**
 * @deprecated
 */
export default function (cli: any) {
  cli
    .command('install [project]')
    .description('安装依赖')
    .alias('i')
    .action((project: string) => {
      if (project === 'mirai')
        installMirai()
    })
}

/**
 * 安装 mirai
 * @deprecated
 */
function installMirai() {
  logger.warning(
    '这只是 mirai-api-http 辅助的安装脚本，你完全可以自行启动 mirai 而无需使用它。(本脚本默认已将 mirai-console-loader 放置于当前 mcl 文件夹中。)',
  )
  logger.info(
    '推荐使用官方启动器 mirai-console-loader ( https://github.com/iTXTech/mirai-console-loader )',
  )
  logger.info(
    '\nel-bot 基于 mirai-api-http 且专注于机器人本身逻辑，但不提供任何关于如何下载启动 mirai 的解答，你应该自行掌握如何使用 mirai。\n在使用 el-bot 过程中遇到的问题，欢迎提 ISSUE，或加入我们的 QQ群 : 707408530 / TG群: https://t.me/elpsy_cn。',
  )

  // @deprecated mirai prompt
}
