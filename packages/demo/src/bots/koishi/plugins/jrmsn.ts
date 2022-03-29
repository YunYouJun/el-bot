import type { Bot, Context } from 'koishi'
import { segment } from 'koishi'
import dayjs from 'dayjs'

export const name = 'jrmsn'

export interface JrmsnOptions {
  groups: number[]
}

/**
 * 随机选中一位群友担任今日美少女
 * @param ctx
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function apply(ctx: Context, options: JrmsnOptions) {
  let msn: Bot.GuildMember
  let lastUpdated = dayjs().format('YYYY-MM-DD')

  ctx.middleware(async(session, next) => {
    if (session.content === '今日美少女') {
      const list = await session.bot.getGuildMemberList(session.guildId || '')
      const today = dayjs().format('YYYY-MM-DD')
      if (!msn || today !== lastUpdated) {
        const len = list.length
        msn = list[Math.floor(Math.random() * len)]
        lastUpdated = today
      }
    }
    console.log(msn)
    return `今日担任美少女的是：${segment.at(msn.userId)}！` || next()
  })
}
