import ElBot from "src/bot";
import { MessageType } from "mirai-ts";
import { isAt } from "mirai-ts/dist/message/index";
import log from "mirai-ts/dist/utils/log";
import { includes } from "mirai-ts/dist/utils/message";
import { getListenStatusByConfig } from "@utils/index";

// implement the autoloadback referenced in loki constructor
export default function teach(ctx: ElBot) {
  const config = ctx.el.config;
  const db = ctx.db;
  const mirai = ctx.mirai;

  let teach = db.getCollection("teach");
  if (teach === null) {
    teach = db.addCollection("teach", {
      unique: ["question"],
    });
    log.success("新建 Collection：teach");
  }

  // 检测学习关键词
  // Q: xxx
  // A: xxx
  mirai.on("message", (msg: MessageType.ChatMessage) => {
    // 私聊或被艾特时
    if (
      includes(msg.plain, ["Q:", "\nA:"]) &&
      (isAt(msg, ctx.el.qq) || msg.type === "FriendMessage")
    ) {
      // 没有权限时
      if (!getListenStatusByConfig(msg.sender, config.teach)) {
        msg.reply(config.teach.else);
        return;
      }

      // 学习应答
      log.info(msg.plain);
      const question = (msg.plain.match(/Q:(.*)\n/) || "")[1].trim();
      const answer = (msg.plain.match(/\nA:(.*)/) || "")[1].trim();
      try {
        teach.insert({
          question,
          answer,
        });
        msg.reply(config.teach.reply);
      } catch (err) {
        const result = teach.findOne({
          question,
        });
        msg.reply(
          `存在重复，已覆盖旧值：\nQ: ${result.question}\nA: ${result.answer}`
        );
        result.answer = answer;
      }
    } else {
      // 查找应答
      const result = teach.findOne({
        question: msg.plain,
      });
      if (result) msg.reply(result.answer);
    }
  });
}

teach.version = "0.0.1";
teach.description = "问答学习";
