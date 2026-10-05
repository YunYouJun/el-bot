import type { Bot } from 'el-bot'
import type { CustomFields } from 'rss-parser'
import consola from 'consola'
import dayjs from 'dayjs'
import { defineBotPlugin } from 'el-bot'
import fs from 'fs-extra'
import { htmlToText } from 'html-to-text'

import schedule from 'node-schedule'
import Parser from 'rss-parser'

interface RssConfig {
  name: string
  url: string
  cron: string
  customFields: CustomFields<string[], string[]>
  content: string[]
  target: object
}

class Rss {
  config: RssConfig
  parser: Parser
  constructor(public ctx: Bot, rssConfig: RssConfig) {
    const defaultConfig = {
      cron: '*/15 * * * *',
      customFields: {
        item: ['updated'],
      },
      content: [
        // eslint-disable-next-line no-template-curly-in-string
        '标题：${item.title}',
        // eslint-disable-next-line no-template-curly-in-string
        '链接：${item.link}',
        // eslint-disable-next-line no-template-curly-in-string
        '时间：${item.updated}',
      ],
    }
    rssConfig = Object.assign(defaultConfig, rssConfig)

    this.config = rssConfig
    this.parser = new Parser({
      customFields: rssConfig.customFields,
    })
  }

  init() {
    schedule.scheduleJob(this.config.cron, () => {
      this.parse()
    })
  }

  async parse() {
    let feed: Parser.Output<any>
    try {
      feed = await this.parser.parseURL(this.config.url)
    }
    catch {
      this.ctx.logger.error(
        `[rss] ${this.config.name} 超时，${this.config.url} 解析失败`,
      )
      return
    }

    if (feed.items && this.save(feed)) {
      // only semd first
      const content = feed.title + format(feed.items[0], this.config.content)
      this.ctx.sender.sendMessageByConfig(content, this.config.target)
    }
  }

  save(feed: any) {
    if (feed.items && feed.items.length <= 0)
      return false

    const path = `${this.ctx.tmpDir}rss.json`
    let rssJson: any = {}

    if (fs.existsSync(path)) {
      const data = fs.readFileSync(path)
      rssJson = JSON.parse(data.toString())
    }
    else {
      fs.mkdirSync(this.ctx.tmpDir, { recursive: true })
    }

    // 缓存文件不存在 或 对应对象不存在则更新
    if (
      Object.keys(rssJson).length === 0
      || !rssJson[this.config.name]
      || (feed.items
        && rssJson[this.config.name].items[0].pubDate !== feed.items[0].pubDate)
    ) {
      this.ctx.logger.info(`[rss] ${feed.title} 已更新`)
      rssJson[this.config.name] = {
        title: feed.title,
        lastBuildDate: feed.lastBuildDate,
        items: [
          {
            title: (feed.items as any)[0].title,
            pubDate: (feed.items as any)[0].pubDate,
          },
        ],
      }
      fs.writeFileSync(path, JSON.stringify(rssJson))
      this.ctx.logger.success(`[rss] 已在本地记录 ${feed.title} 新的 RSS 信息`)
      return true
    }
    else {
      this.ctx.logger.info(`[rss] ${feed.title} 未更新`)
      return false
    }
  }
}

function format(item: any, content: string[]) {
  item.updated = dayjs(item.updated).format('YYYY-MM-DD HH:mm:ss')
  item.pubDate = dayjs(item.pubDate).format('YYYY-MM-DD HH:mm:ss')

  if (item.summary)
    item.summary = htmlToText(item.summary)

  if (item.content)
    item.content = htmlToText(item.content)

  if (item.description)
    item.description = htmlToText(item.description)

  let template = ''

  // default template
  if (!content) {
    content = [
      // eslint-disable-next-line no-template-curly-in-string
      '标题：${item.title}',
      // eslint-disable-next-line no-template-curly-in-string
      '链接：${item.link}',
      // eslint-disable-next-line no-template-curly-in-string
      '时间：${item.updated}',
    ]
  }
  content.forEach((line) => {
    template += `\n${line}`
  })

  // not use eval
  // eslint-disable-next-line no-new-func
  return new Function('item', `return \`${template}\``)(item)
}

/**
 * 立即触发 RSS 抓取
 * @param ctx
 * @param options
 */
export function triggerRss(ctx: Bot, options: RssConfig[]) {
  ctx.logger.success('[rss] 立即触发 RSS 抓取')
  let content = '您当前订阅的所有 RSS 源：'

  options.forEach((rssConfig: RssConfig) => {
    content += `\n${rssConfig.name}: ${rssConfig.url}`
    const rss = new Rss(ctx, rssConfig)
    rss.parse()
  })

  return content
}

export type RssOptions = RssConfig[]

export default defineBotPlugin<RssOptions>((options) => {
  return {
    extendCli(cli) {
      cli
        .command('rss')
        .description('RSS 订阅')
        .option('-t, --trigger', '立即触发 RSS 抓取')
        .option('-l, --list <list>', '订阅列表')
        .action(({ trigger, list }: { trigger?: boolean, list?: string }) => {
          consola.info(trigger, list)
        // const content = triggerRss(ctx, rssOptions)
        // const msg = mirai.curMsg as MessageType.GroupMessage
        // if (cmdOptions.list === 'current' && msg.sender.group) {
        // // 列出当前群 rss 订阅
        //   let rssList = ''
        //   let count = 0
        //   options.forEach((rssConfig: RssConfig) => {
        //     if (ctx.status.isListening(msg.sender, rssConfig.target)) {
        //       count += 1
        //       rssList += `\n${rssConfig.name}: ${rssConfig.url}`
        //     }
        //   })
        //   if (count !== 0)
        //     msg.reply(`本群共订阅了 ${count} 个 RSS 源：${rssList}`)
        //   else
        //     msg.reply('本群尚未订阅 RSS')
        // }
        // else if (cmdOptions.list === 'all') {
        // // 列出所有 rss 订阅
        //   if (ctx.user.isAllowed(msg.sender.id, true))
        //     msg.reply(content)
        // }
        })
    },

    setup(ctx) {
      // const { cli, napcat } = ctx
      const rssOptions = options

      consola.log(rssOptions)

      // 初始化定时
      if (options) {
        options.forEach((rssConfig: RssConfig) => {
          const rss = new Rss(ctx, rssConfig)
          rss.init()
        })
      }
    },
  }
})
