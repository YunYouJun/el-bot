
import { Message, check } from 'mirai-ts'
import axios from 'axios'
import { utils } from 'el-bot'
import type { Bot } from 'el-bot'

/**
 * 色图格式
 */
export interface SetuImage {
  url: string
}

/**
 * 色图配置项
 */
export interface SetuOptions {
  url: string
  proxy: string
  match: check.Match[]
  reply: string
}

const setu = {
  url: 'https://el-bot-api.vercel.app/api/setu',
  proxy: 'https://images.weserv.nl/?url=',
  match: [
    {
      is: '不够色',
    },
    {
      includes: ['来', '色图'],
    },
  ],
  reply: '让我找找',
}

/**
 * 获取随机图片
 */
function getRandomImage(image: SetuImage[]) {
  const index = Math.floor(Math.random() * image.length)
  return image[index]
}

/**
 *
 * @param {Bot} ctx
 * @param {SetuOptions} options
 */
export default function(ctx: Bot, options: SetuOptions) {
  const mirai = ctx.mirai
  utils.config.merge(setu, options)

  let image: any
  if (setu.url) {
    mirai.on('message', (msg) => {
      setu.match.forEach(async(obj) => {
        if (check.match(msg.plain.toLowerCase(), obj)) {
          if (setu.reply)
            msg.reply(setu.reply)

          if (utils.isUrl(setu.url)) {
            const { data } = await axios.get(setu.url)
            image = data
            if (!image.url) image = data.data[0]
          }
          else {
            const setuJson: any = await require(setu.url)
            image = getRandomImage(setuJson.image)
          }

          // 图片链接设置代理
          if (setu.proxy) image.url = setu.proxy + image.url
          msg.reply([Message.Image('', image.url)])
        }
      })
    })
  }
}
