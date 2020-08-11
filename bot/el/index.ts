import { resolve } from "path";
import dotenv from "dotenv";

dotenv.config({
  path: resolve(__dirname, "../.env"),
});

export = {
  qq: parseInt(process.env.BOT_QQ || ""),
  setting: {
    enableWebsocket: true,
  },
  config: {
    plugins: {
      default: ["dev", "answer", "cli", "forward", "rss", "limit", "teach"],
      // official: ["niubi", "setu", "hitokoto"],
    },
    answer: [
      {
        includes: "青春",
        api: "https://elpsy.vercel.app/api/words/young",
        reply: "${data[0]}",
      },
    ],
  },
};
