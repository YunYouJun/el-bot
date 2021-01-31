import Bot from "el-bot";
import { MessageType } from "mirai-ts";
import { TeachOptions } from "./options";
import { displayList } from "./utils";
import { Teach } from "./teach.schema";

// implement the autoloadback referenced in loki constructor
export default async function teach(ctx: Bot, options: TeachOptions) {
  if (!ctx.db) return;

  const { mirai } = ctx;

  // register command
  // 显示当前已有的问答列表
  ctx.cli
    .command("teach")
    .description("问答教学")
    .option("-l, --list", "当前列表")
    .action(async (options) => {
      if (options.list) {
        ctx.reply(await displayList());
      }
    });

  // 检测学习关键词
  // Q: xxx
  // A: xxx
  mirai.on("message", async (msg: MessageType.ChatMessage) => {
    // 私聊或被艾特时
    const qa = msg.plain.match(/Q:(.*)\nA:(.*)/);
    if (
      qa &&
      (msg.type === "FriendMessage" ||
        (msg.type === "GroupMessage" && msg.isAt()))
    ) {
      // 没有权限时
      if (!ctx.status.getListenStatusByConfig(msg.sender, options)) {
        msg.reply(options.else);
        return;
      }

      // 学习应答
      ctx.logger.info("[teach] " + msg.plain);
      const question = qa[1].trim();
      const answer = qa[2].trim();

      const result = await Teach.findOneAndUpdate(
        {
          question,
        },
        {
          answer,
        },
        {
          upsert: true,
        }
      );
      if (result) {
        msg.reply(
          `存在重复，已覆盖旧值：\nQ: ${result.question}\nA: ${result.answer}`
        );
      } else {
        msg.reply(options.reply);
      }
    } else {
      // 查找应答
      const result = await Teach.findOne({
        question: msg.plain,
      });
      if (result) msg.reply(result.answer);
    }
  });
}
