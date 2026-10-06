import type { AnswerOptions } from './utils'
// import axios from 'axios'
// import * as nodeSchdule from 'node-schedule'
import { defineBotPlugin, onNapcatMessage } from '../../core'
// import { displayAnswerList, renderString } from './utils'
import pkg from './package.json'
import { displayAnswerList } from './utils'

export * from './utils'

export default defineBotPlugin<AnswerOptions>((options) => {
  return {
    pkg,
    // extendCli: (cli) => {
    //   cli
    //     .command('answer')
    //     .option('-l --list')
    //     .action((opts) => {
    //       if (opts.list) {
    //         const answerList = displayAnswerList(options)
    //         ctx.reply(answerList)
    //       }
    //     })
    // },

    setup(ctx) {
      ctx.command('answer')
        .description('查看自动应答的使用帮助')
        .usage('answer')
        .example('answer')
        .action(() => displayAnswerList(options))

      // 设置定时
      // options.forEach((ans) => {
      //   if (ans.cron) {
      //     nodeSchdule.scheduleJob(ans.cron, async () => {
      //       if (!ans.target)
      //         return
      //       const replyContent = ans.api
      //         ? await renderStringByApi(ans.api, ans.reply)
      //         : ans.reply
      //       ctx.sender.sendMessageByConfig(replyContent, ans.target)
      //     })
      //   }
      // })

      // 应答
      onNapcatMessage(async (msg) => {
        // use async in some
        // https://advancedweb.hu/how-to-use-async-functions-with-array-some-and-every-in-javascript/
        for await (const ans of options.list) {
          // const replyContent = null
          // if (ans.at) {
          //   if (!(msg.type === 'GroupMessage' && msg.isAt()))
          //     return
          // }

          if (ans.receivedText?.includes(msg.raw_message)) {
            await ctx.reply(msg, ans.reply)
            break
          }

          // if (msg.plain && check.match(msg.plain, ans)) {
          // // 默认监听所有
          //   if (ctx.status.getListenStatusByConfig(msg.sender, ans)) {
          //     replyContent = ans.api
          //       ? await renderStringByApi(ans.api, ans.reply)
          //       : ans.reply
          //   }
          //   else if (ans.else) {
          //   // 后续可以考虑用监听白名单、黑名单优化
          //     replyContent = ans.api
          //       ? await renderStringByApi(ans.api, ans.else)
          //       : ans.else
          //   }

        //   if (replyContent) {
        //     await msg.reply(replyContent, ans.quote)
        //     // 有一个满足即跳出
        //     break
        //   }
        }
      })
    },
  }
})
