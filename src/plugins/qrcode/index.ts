import Bot from "src/bot";
import QRCode from "qrcode";
import { Message, MessageType } from "mirai-ts";
import fs from "fs";
import { resolve } from "path";

/**
 * 生成二维码
 * @param text
 */
async function generateQR(text: string) {
  const timestamp = new Date().valueOf();
  const filename = `${timestamp}.png`;
  const path = resolve(
    process.cwd(),
    "mirai",
    `plugins/MiraiAPIHTTP/images/${filename}`
  );
  await QRCode.toFile(path, text);
  return filename;
}

export default function (ctx: Bot) {
  const { cli } = ctx;

  if (!fs.existsSync("tmp/images")) {
    fs.mkdirSync("tmp/images");
  }

  cli
    .command("qrcode <text>")
    .description("生成二维码")
    .action(async (text: string) => {
      const msg = ctx.mirai.curMsg;
      const filename = await generateQR(text);
      const chain = [Message.Image(null, null, filename)];
      (msg as MessageType.ChatMessage).reply(chain);
    });
}
