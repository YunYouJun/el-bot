import Bot from "el-bot";
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
  const pkg = ctx.el.pkg;
  console.log("-----------------------------------------------");
  ctx.logger.info(`Docs: ${pkg.homepage}`);
  ctx.logger.info(`GitHub: ${pkg.repository.url}`);
  ctx.logger.info(`El-Bot Version: ${chalk.cyan(pkg.version)}`);
  console.log("-----------------------------------------------");
}
