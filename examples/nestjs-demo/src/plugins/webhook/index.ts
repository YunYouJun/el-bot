import type { Bot } from 'el-bot'
import consola from 'consola'

export default function (ctx: Bot) {
  ctx.webhook?.on('push', (data: any) => {
    consola.info('Get type OK!')
    consola.info(data)
  })
}
