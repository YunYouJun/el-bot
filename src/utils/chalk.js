const chalk = require("chalk");

const info = (msg) => {
  console.log(chalk.blue(msg));
};

const success = (msg) => {
  console.log(chalk.green(msg));
};

const warning = (msg) => {
  console.log(chalk.yellow(msg));
};

const error = (msg) => {
  console.log(chalk.red(msg));
};

module.exports = {
  info,
  success,
  warning,
  error,
};
