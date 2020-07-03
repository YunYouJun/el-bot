import ElBot from "src/bot";
import { MessageType } from "mirai-ts";

export default async function dev(ctx: ElBot) {
  const mirai = ctx.mirai;

  console.log("on message");
  mirai.on("message", (msg: MessageType.SingleMessage) => {
    console.log(msg);
  });
}

dev.version = "0.0.1";
dev.description = "开发输出";
