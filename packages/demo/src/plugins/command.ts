import Bot from 'el-bot'

export default function(ctx: Bot) {
  ctx
    .command('命令')
    .description('一个测试用的命令')
    .action((options) => {
      console.log(options)
    })
}
