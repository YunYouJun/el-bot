import ElBot from "src/bot";

export default async function dev(ctx: ElBot) {
  const mirai = ctx.mirai;
  // const config = ctx.el.config;
  // mirai.api.sendFriendMessage("咳咳……麦克风测试，麦克风测试……", config.master[0]);

  console.log("on message");
  mirai.on("message", (msg) => {
    console.log(msg);
  });

  mirai.on("MemberJoinRequestEvent", (msg) => {
    console.log(msg);
  });
}

dev.version = "0.0.1";
dev.description = "开发输出";
