import fs from 'fs'
import { resolve } from 'path'
import type { Bot } from 'el-bot'
import { utils } from 'el-bot'
import QRCode from 'qrcode'
import type { MessageType } from 'mirai-ts'
import { Message } from 'mirai-ts'
import pkg from './package.json'
import type { QRCodeOptions } from './options'
import qrcodeOptions from './options'

/**
 * 生成二维码
 * @param text
 * @param folder 目标文件夹
 */
async function generateQR(text: string, folder: string) {
  const timestamp = new Date().valueOf()
  const filename = `${timestamp}.png`
  await QRCode.toFile(`${folder}/${filename}`, text)
  return filename
}

export default function(ctx: Bot, options: QRCodeOptions = qrcodeOptions) {
  const { cli } = ctx
  const folder = resolve(ctx.el.path!.image, pkg.name)

  if (!fs.existsSync(folder))
    fs.mkdirSync(folder, { recursive: true })

  if (options.autoClearCache)
    fs.rmSync(folder, { recursive: true })

  cli
    .command('qrcode <text...>')
    .description('生成二维码')
    .action(async(text: string[]) => {
      const msg = ctx.mirai.curMsg as MessageType.ChatMessage
      try {
        const filename = await generateQR(text.join(' '), folder)
        console.log(`${folder}/${pkg.name}/${filename}`)
        const chain = [Message.Image(null, null, `${folder}/${filename}`)]
        msg.reply(chain)
      }
      catch (e: any) {
        if (e)
          msg.reply(e.message)

        utils.handleError(e)
      }
    })
}
