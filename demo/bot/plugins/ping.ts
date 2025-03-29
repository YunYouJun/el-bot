import { defineBotPlugin, onMessage, pluginLogger } from 'el-bot'
import { Structs } from 'node-napcat-ts'

export default defineBotPlugin({
  pkg: {
    name: 'ping',
    version: '0.0.1',
  },
  setup: (ctx) => {
    onMessage(async (msg) => {
      pluginLogger
        .child({ plugin: 'ping' })
        .info('这是 ping 自己的插件日志')

      if (msg.raw_message === 'ping') {
        await ctx.reply(msg, [
          Structs.text('pong'),
        ])
      }
      if (msg.raw_message === '1') {
        await ctx.reply(msg, [
          Structs.text('2'),
        ])
      }
    })
  },
})
