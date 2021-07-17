import Bot from "el-bot";
import QRCode from "qrcode";
import { Message, MessageType } from "mirai-ts";
import fs from "fs";
import { resolve } from "path";
import pkg from "./package.json";
import { QRCodeOptions } from "./options";

/**
 * 生成二维码
 * @param text
 * @param folder 目标文件夹
 */
async function generateQR(text: string, folder: string) {
  const timestamp = new Date().valueOf();
  const filename = `${timestamp}.png`;
  await QRCode.toFile(`${folder}/${filename}`, text);
  return filename;
}

export default function (ctx: Bot, options: QRCodeOptions) {
  const { cli } = ctx;
  const folder = resolve(ctx.el.path!.image, pkg.name);

  if (options.autoClearCache) {
    fs.rmdirSync(folder, { recursive: true });
  }

  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  cli
    .command("qrcode <text...>")
    .description("生成二维码")
    .action(async (text: string[]) => {
      const msg = ctx.mirai.curMsg as MessageType.ChatMessage;
      try {
        const filename = await generateQR(text.join(" "), folder);
        console.log(`${folder}/${pkg.name}/${filename}`);
        const chain = [Message.Image(null, null, `${folder}/${filename}`)];
        msg.reply(chain);
      } catch (e) {
        msg.reply(e.message);
      }
    });
}
