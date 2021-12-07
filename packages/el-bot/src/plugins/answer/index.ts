import Bot from 'el-bot'
import { MessageType, check } from 'mirai-ts'
import axios from 'axios'
import nodeSchdule from 'node-schedule'
import { renderString } from '../../utils/index'
import { displayAnswerList, AnswerOptions } from './utils'
export { AnswerOptions }

/**
 * 根据 API 返回的内容渲染字符串
 * @param api
 * @param content
 */
async function renderStringByApi(
  api: string,
  content: string | MessageType.MessageChain,
) {
  const { data } = await axios.get(api)
  if (typeof content === 'string') {
    return renderString(content, data, 'data')
  }
  else {
    (content as any).forEach((msg: MessageType.SingleMessage) => {
      if (msg.type === 'Plain')
        msg.text = renderString(msg.text, data, 'data')
    })
    return content
  }
}

export default function(ctx: Bot, options: AnswerOptions) {
  const { mirai, cli } = ctx
  if (!options) return

  cli
    .command('answer')
    .option('-l --list')
    .action((opts) => {
      if (opts.list) {
        const answerList = displayAnswerList(options)
        ctx.reply(answerList)
      }
    })

  // 设置定时
  options.forEach((ans) => {
    if (ans.cron) {
      nodeSchdule.scheduleJob(ans.cron, async() => {
        if (!ans.target) return
        const replyContent = ans.api
          ? await renderStringByApi(ans.api, ans.reply)
          : ans.reply
        ctx.sender.sendMessageByConfig(replyContent, ans.target)
      })
    }
  })

  // 应答
  mirai.on('message', async(msg) => {
    // use async in some
    // https://advancedweb.hu/how-to-use-async-functions-with-array-some-and-every-in-javascript/
    for await (const ans of options) {
      let replyContent = null

      if (ans.at)
        if (!(msg.type === 'GroupMessage' && msg.isAt())) return

      if (msg.plain && check.match(msg.plain, ans)) {
        // 默认监听所有
        if (ctx.status.getListenStatusByConfig(msg.sender, ans)) {
          replyContent = ans.api
            ? await renderStringByApi(ans.api, ans.reply)
            : ans.reply
        }
        else if (ans.else) {
          // 后续可以考虑用监听白名单、黑名单优化
          replyContent = ans.api
            ? await renderStringByApi(ans.api, ans.else)
            : ans.else
        }

        if (replyContent) {
          await msg.reply(replyContent, ans.quote)
          // 有一个满足即跳出
          break
        }
      }
    }
  })
}
