import Bot from "src";
import chalk from "chalk";

/**
 * 休眠
 * @param ms
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 声明
 */
export function statement(ctx: Bot) {
  const pkg = require("../../package.json");
  console.log("-----------------------------------------------");
  ctx.logger.info(`GitHub: ${ctx.pkg.repository.url}`);
  ctx.logger.info(`El-Bot Version: ${chalk.cyan(pkg.version)}`);
  ctx.logger.warning(
    chalk.cyan("el-bot") + " 是一个非盈利的开源项目，仅供交流学习使用。"
  );
  ctx.logger.warning(
    "请勿用于商业或非法用途，因使用而与腾讯公司产生的一切纠纷均与原作者无关。"
  );
  console.log("-----------------------------------------------");
}
