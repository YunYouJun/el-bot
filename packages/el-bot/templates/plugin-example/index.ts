import { defineBotPlugin } from 'el-bot'

export default defineBotPlugin({
  pkg: { name: 'login', description: '查询机器人登录账号' },
  setup(ctx) {
    ctx.command('login')
      .description('查询机器人登录账号')
      .usage('login')
      .example('login')
      .action(async () => {
        const data = await ctx.napcat.get_login_info()
        return `当前登录账号：${data.nickname}(${data.user_id})`
      })
  },
})
