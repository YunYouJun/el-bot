import Bot from "el-bot";

export default function (ctx: Bot) {
  const mirai = ctx.mirai;

  mirai.on("message", (msg) => {
    if (msg.plain.toLowerCase() === "el psy congroo") {
      msg.reply("这一切都是命运石之门的选择……");
    }
  });
}
