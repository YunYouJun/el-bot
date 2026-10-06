import { defineBotPlugin } from 'el-bot'

export default defineBotPlugin({
  pkg: {
    name: 'ping',
  },
  setup(bot) {
    bot.command('ping')
      .description('测试机器人是否在线')
      .usage('ping')
      .example('ping')
      .action(() => 'pong')
  },
})
