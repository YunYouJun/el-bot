import Bot from "../../src";

export default function (ctx: Bot) {
  ctx.webhook.on("ok", () => {
    console.log("Get type OK!");
  });
}
