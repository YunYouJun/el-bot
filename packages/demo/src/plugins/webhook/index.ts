import Bot from "el-bot";

export default function (ctx: Bot) {
  ctx.webhook?.on("ok", (data: any) => {
    console.log("Get type OK!");
    console.log(data);
  });
}
