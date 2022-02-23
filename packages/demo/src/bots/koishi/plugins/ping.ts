import type { Context } from 'koishi'

export default function ping(ctx: Context) {
  // 如果收到“天王盖地虎”，就回应“宝塔镇河妖”
  ctx.middleware(async(session, next) => {
    let reply = ''
    switch (session.content) {
      case '(':
        reply = ')'
        break
      case '（':
        reply = '）'
        break
      default:
        break
    }
    return reply || next()
  })
}
