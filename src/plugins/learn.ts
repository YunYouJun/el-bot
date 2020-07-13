import ElBot from "src/bot";
import { MessageType } from "mirai-ts";
import log from "mirai-ts/dist/utils/log";
import { includes } from "mirai-ts/dist/utils/message";
import { isAllowed } from "@utils/global";

// implement the autoloadback referenced in loki constructor
export default function learn(ctx: ElBot) {
  // const config = ctx.el.config;
  const db = ctx.db;
  const mirai = ctx.mirai;

  let learn = db.getCollection("learn");
  if (learn === null) {
    learn = db.addCollection('learn', {
      unique: ['question'],
    });
    log.success("新建 Collection：learn");
  }

  // 检测学习关键词
  // Q: \n
  // A: \n
  mirai.on("message", (msg: MessageType.SingleMessage) => {
    if (isAllowed(msg.sender) && includes(msg.plain, ['Q:', '\nA:'])) {
      // 学习应答
      log.info(msg.plain);
      const question = msg.plain.match(/Q:(.*)\n/)[1].trim();
      const answer = msg.plain.match(/\nA:(.*)/)[1].trim();
      try {
        learn.insert({
          question,
          answer
        });
      } catch (err) {
        const result = learn.findOne({
          question
        });
        msg.reply(`存在重复，已覆盖旧值：\nQ: ${result.question}\nA: ${result.answer}`);
        result.answer = answer;
      }

    } else {
      // 查找应答
      const result = learn.findOne({
        question: msg.plain
      });
      if (result) msg.reply(result.answer);
    }
  });
}

learn.version = "0.0.1";
learn.description = "问答学习";
