import commander from "commander";

/**
 * 清理全局选项
 * @param options
 */
export function cleanOptions(program: commander.Command) {
  const options = program.opts();

  // reset option
  Object.keys(options).forEach((key) => {
    delete options[key];

    // 重新设置默认值
    if (options.length > 0) {
      options.forEach((option: any) => {
        if (
          option.defaultValue &&
          (option.long === `--${key}` || option.short === `-${key}`)
        ) {
          options[key] = option.defaultValue;
        }
      });
    }
  });

  if (program.commands.length > 0) {
    program.commands.forEach((command) => {
      cleanOptions(command);
    });
  }
}
