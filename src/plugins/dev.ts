import ElBot from "src/bot";
import { MessageType } from "mirai-ts";

export default async function (ctx: ElBot) {
  const mirai = ctx.mirai;

  console.log("on message");
  mirai.on("message", (msg: MessageType.SingleMessage) => {
    console.log(msg);
  });
}
