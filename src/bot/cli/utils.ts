import commander from "commander";

/**
 * 清理全局选项
 * @param options
 */
export function cleanOptions(program: commander.Command) {
  const options = program.opts();

  // reset option
  Object.keys(options).forEach((key) => {
    delete program[key];

    // 重新设置默认值
    if (program.options.length > 0) {
      program.options.forEach((option: any) => {
        if (
          option.defaultValue &&
          (option.long === `--${key}` || option.short === `-${key}`)
        ) {
          program[key] = option.defaultValue;
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
