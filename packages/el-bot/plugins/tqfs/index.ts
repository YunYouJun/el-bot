import consola from 'consola'
import { defineBotPlugin, onNapcatMessage } from 'el-bot'
import colors from 'picocolors'

export default defineBotPlugin({
  setup(ctx) {
    const { napcat } = ctx
    onNapcatMessage(async (msg) => {
      consola.info('napcat message', msg)

      if (msg.raw_message === 'Get Login Info') {
        const data = await napcat.get_login_info()
        consola.info('当前登录账号:', `${colors.yellow(data.nickname)}(${colors.cyan(data.user_id)})`)
      }
    })
  },
})
