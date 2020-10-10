import ElBot from "src/bot";

export default async function (ctx: ElBot) {
  const mirai = ctx.mirai;
  // const config = ctx.el.config;
  // mirai.api.sendFriendMessage("咳咳……麦克风测试，麦克风测试……", config.master[0]);

  console.log("on message");
  mirai.on("message", (msg) => {
    // msg.reply(msg.plain);
    console.log(msg);
  });
}
