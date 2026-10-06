import { defineBotPlugin } from 'el-bot'
import testOptions from './options'

export default defineBotPlugin({
  pkg: { name: 'test' },
  setup(bot) {
    bot.command('test')
      .description(testOptions.help)
      .usage('test')
      .example('test')
      .action(() => 'Link Start!')
  },
})
