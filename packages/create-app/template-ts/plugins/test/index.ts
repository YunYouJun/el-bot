import type { Bot } from 'el-bot'
import type { TestOptions } from './options'

export default (ctx: Bot, options: TestOptions) => {
  ctx.logger.info(options)
  ctx.napcat.on('message', async (msg) => {
    if (msg.raw_message === 'test')
      await ctx.reply(msg, 'Link Start!')
  })
}
