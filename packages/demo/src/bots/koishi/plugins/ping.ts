import type { Context } from 'koishi'

export const name = 'ping'

export function apply(ctx: Context) {
  // 如果收到“天王盖地虎”，就回应“宝塔镇河妖”
  ctx.middleware(async(session, next) => {
    const replyMap: Record<string, string> = {
      '(': ')',
      '（': '）',
      '[': ']',
      '&#91;': ']',
      '【': '】',
      'ping': 'pong',
    }
    let reply
    if (session.content)
      reply = replyMap[session.content]

    return reply || next()
  })
}
