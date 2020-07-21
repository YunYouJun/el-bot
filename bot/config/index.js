import dotenv from "dotenv";
dotenv.config();

module.exports = {
  qq: parseInt(process.env.BOT_QQ),
  setting: {
    enableWebsocket: true,
  },
  config: {
    plugins: {
      default: ["answer"],
    },
  },
};
