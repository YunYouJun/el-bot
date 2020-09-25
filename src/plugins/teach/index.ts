import Bot from "src/bot";
import { MessageType, check } from "mirai-ts";
import { TeachOptions } from "./options";
import { displayList } from "./utils";

// implement the autoloadback referenced in loki constructor
export default async function teach(ctx: Bot, options: TeachOptions) {
  if (!ctx.db) return;

  const { db, mirai } = ctx;
  const teach = db.collection("teach");

  // 初始化 collection 结构
  if ((await teach.find().count()) === 0) {
    teach.createIndex(
      {
        question: 1,
      },
      {
        unique: true,
      }
    );

    ctx.logger.success("[teach] 新建 Collection：teach");
  }

  // register command
  // 显示当前已有的问答列表
  ctx.cli
    .command("teach")
    .description("问答教学")
    .option("-l, --list", "当前列表")
    .action(async (options) => {
      if (options.list) {
        ctx.reply(displayList(teach));
      }
    });

  // 检测学习关键词
  // Q: xxx
  // A: xxx
  mirai.on("message", async (msg: MessageType.ChatMessage) => {
    // 私聊或被艾特时
    const qa = msg.plain.match(/Q:(.*)\nA:(.*)/);
    if (qa && (check.isAt(msg, ctx.el.qq) || msg.type === "FriendMessage")) {
      // 没有权限时
      if (!ctx.status.getListenStatusByConfig(msg.sender, options)) {
        msg.reply(options.else);
        return;
      }

      // 学习应答
      ctx.logger.info("[teach] " + msg.plain);
      const question = qa[1].trim();
      const answer = qa[2].trim();

      const result = await teach.findOne({
        question,
      });
      if (result) {
        teach.updateOne(
          {
            question,
          },
          {
            $set: {
              answer,
            },
          }
        );
        msg.reply(
          `存在重复，已覆盖旧值：\nQ: ${result.question}\nA: ${result.answer}`
        );
      } else {
        teach.insertOne({
          question,
          answer,
        });
        msg.reply(options.reply);
      }
    } else {
      // 查找应答
      const result = await teach.findOne({
        question: msg.plain,
      });
      if (result) msg.reply(result.answer);
    }
  });
}
