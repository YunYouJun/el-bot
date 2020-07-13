import ElBot from "src/bot";
import { MessageType } from "mirai-ts";
import { isAt } from "mirai-ts/dist/message/index";
import log from "mirai-ts/dist/utils/log";
import { includes } from "mirai-ts/dist/utils/message";
import { getListenStatusByConfig } from "@utils/index";

// implement the autoloadback referenced in loki constructor
export default function learn(ctx: ElBot) {
  const config = ctx.el.config;
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
  // Q: xxx
  // A: xxx
  mirai.on("message", (msg: MessageType.SingleMessage) => {
    // 私聊或被艾特时
    if (includes(msg.plain, ['Q:', '\nA:']) && (isAt(msg, ctx.el.qq) || !msg.sender.group)) {

      // 没有权限时
      if (!getListenStatusByConfig(msg.sender, config.learn)) {
        msg.reply(config.learn.else);
        return;
      }

      // 学习应答
      log.info(msg.plain);
      const question = msg.plain.match(/Q:(.*)\n/)[1].trim();
      const answer = msg.plain.match(/\nA:(.*)/)[1].trim();
      try {
        learn.insert({
          question,
          answer
        });
        msg.reply(config.learn.reply);
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
