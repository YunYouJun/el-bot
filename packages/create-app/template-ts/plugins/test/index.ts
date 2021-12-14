import type Bot from 'el-bot'
import type { TestOptions } from './options'

/**
 * 这是一个测试插件
 */
export default (ctx: Bot, options: TestOptions) => {
  const { mirai } = ctx
  ctx.logger.info(options)
  mirai.on('message', async(msg) => {
    ctx.logger.info(msg)
    if (msg.plain === 'test')
      msg.reply('Link Start!')
  })
}
