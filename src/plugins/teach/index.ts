import Bot from "src/bot";
import { MessageType, check } from "mirai-ts";
import log from "mirai-ts/dist/utils/log";

// implement the autoloadback referenced in loki constructor
export default function teach(ctx: Bot) {
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
    const result = msg.plain.match(/Q:(.*)\nA:(.*)/);
    if (result && (check.isAt(msg, ctx.el.qq) || msg.type === "FriendMessage")) {
      // 没有权限时
      if (!ctx.status.getListenStatusByConfig(msg.sender, config.teach)) {
        msg.reply(config.teach.else);
        return;
      }

      // 学习应答
      log.info(msg.plain);
      const question = result[1].trim();
      const answer = result[2].trim();
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
