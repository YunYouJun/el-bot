const { resolve } = require("path");

require("dotenv").config({
  path: resolve(__dirname, "../.env"),
});

module.exports = {
  qq: parseInt(process.env.BOT_QQ),
  setting: {
    enableWebsocket: true,
  },
  config: {
    plugins: {
      default: ["answer", "cli", "forward", "rss", "limit", "teach"],
    },
  },
};
