import chalk from "chalk";

/**
 * 辅助工具，输出彩色控制台信息。
 */
export class Logger {
  /**
   * 输出成功信息（绿色）
   * @param msg 文本
   */
  success(msg: any) {
    console.log(chalk.green("[SUCCESS]"), msg);
  }

  /**
   * 输出警告信息（黄色）
   * @param msg 文本
   */
  warning(msg: any) {
    console.log(chalk.yellow("[WARNING]"), msg);
  }

  /**
   * 输出错误信息（红色）
   * @param msg 文本
   */
  error(msg: any) {
    console.log(chalk.red("[ERROR]"), msg);
  }

  /**
   * 输出提示信息（蓝色）
   * @param msg 文本
   */
  info(msg: any) {
    console.log(chalk.blue("[INFO]"), msg);
  }
}
