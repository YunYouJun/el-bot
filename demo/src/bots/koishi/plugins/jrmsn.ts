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
  const msnMap = new Map<string, {
    lastUpdated: string
    member: Bot.GuildMember
  }>()

  ctx.middleware(async(session, next) => {
    if (session.content === '今日美少女' && session.guildId) {
      const list = await session.bot.getGuildMemberList(session.guildId)
      const today = dayjs().format('YYYY-MM-DD')
      if (!msnMap.has(session.guildId) || today !== msnMap.get(session.guildId)?.lastUpdated) {
        const len = list.length
        const member = list[Math.floor(Math.random() * len)]
        msnMap.set(session.guildId, {
          lastUpdated: today,
          member,
        })
      }
      return `今日担任美少女的是：${segment.at(msnMap.get(session.guildId)!.member.userId)}！`
    }
    else {
      return next()
    }
  })
}
