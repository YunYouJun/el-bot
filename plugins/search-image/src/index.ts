import type { Bot } from 'el-bot'
import { utils } from 'el-bot'
import * as sagiri from 'sagiri'
import type { MessageType } from 'mirai-ts'
import { Message } from 'mirai-ts'

/**
 * 搜图设置
 */
interface SearchImageOptions {
  token: string
  options?: sagiri.Options
}

/**
 *
 * @param result 格式化结果
 */
function formatResult(result: sagiri.SagiriResult): MessageType.MessageChain {
  if (!result) return []
  const msgChain = [
    Message.Plain('\n------------------\n'),
    Message.Image(null, result.thumbnail),
    Message.Plain(`\n相似度：${result.similarity}`),
    Message.Plain(`\n站点：${result.site}`),
    Message.Plain(`\n链接：${result.url}`),
    Message.Plain(`\n作者：${result.authorName || '未知'}`),
  ]
  return msgChain
}

/**
 * 搜图 [SauceNAO](https://saucenao.com/)
 * @param ctx
 * @param config
 */
export default async function searchImage(
  ctx: Bot,
  options: SearchImageOptions,
) {
  const { mirai } = ctx
  const client = sagiri.default(options.token, options.options)

  const innerMode = new utils.InnerMode()

  mirai.on('message', (msg) => {
    innerMode.setMsg(msg)

    if (msg.plain === '搜图') {
      innerMode.enter()
      msg.reply('我准备好了！')
    }

    if (innerMode.getStatus()) {
      msg.messageChain.forEach(async(singleMessage) => {
        if (singleMessage.type === 'Image' && singleMessage.url) {
          let replyContent: MessageType.MessageChain = []

          try {
            const results = await client(singleMessage.url)
            if (results.length === 0) {
              replyContent.push(Message.Plain('未搜索到相关图片'))
            }
            else {
              const length = Math.min(
                options.options?.results || 3,
                results.length,
              )
              replyContent.push(Message.Plain(`返回 ${length} 个结果`))
              for (let i = 0; i < length; i++) {
                const result = results[i]
                const formatContent = formatResult(result)
                replyContent = replyContent.concat(formatContent)
              }
            }
            msg.reply(replyContent)

            // 退出搜图模式
            innerMode.exit()
          }
          catch (err: any) {
            if (err) {
              utils.handleError(err)
              err.message && ctx.logger.error('[search-image]', err.message)
            }
          }
        }
      })
    }
  })
}
