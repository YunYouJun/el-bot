import type { PersonaContext } from '../contracts'
import type { ScheduleControl } from './schedule'
import type { ScheduleRequest } from './schedule-types'
import { Buffer } from 'node:buffer'
import { panelAsset } from '../http'
import { ScheduleError, scheduleErrors } from './schedule-types'

export const SCHEDULE_PATH = '/el-bot/schedule'

/** Owner-cookie, Host and Origin admission is mandatory on every request. */
export function scheduleRoutes(ctx: Pick<PersonaContext, 'webServer' | 'connection'>, control: ScheduleControl) {
  return ctx.webServer.register({ kind: 'prefix', path: SCHEDULE_PATH, handler: async (req, res) => {
    const json = (status: number, value: unknown) => {
      if (res.destroyed || res.writableEnded)
        return
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      res.end(JSON.stringify(value))
    }
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) {
      json(rejection, { ok: false, error: '只有通过 DSH 登录的主人才能配置定时群发。' })
      return
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path !== `${SCHEDULE_PATH}/api`) {
      await panelAsset(req, res, SCHEDULE_PATH)
      return
    }
    try {
      let input: ScheduleRequest
      if (req.method === 'GET') {
        input = { operation: 'list' }
      }
      else if (req.method === 'POST' && req.headers['x-el-bot-schedule'] === '1' && req.headers['content-type']?.startsWith('application/json')) {
        req.setTimeout(65_000, () => req.destroy())
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk)
          if (size > 16 * 1024)
            throw new ScheduleError(413, 'invalid_request')
          chunks.push(Buffer.from(chunk))
        }
        try {
          input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        }
        catch {
          throw new ScheduleError(400, 'invalid_request')
        }
      }
      else {
        json(405, { ok: false, error: '不支持的定时任务请求。' })
        return
      }
      json(200, { ok: true, result: await control.request(input) })
    }
    catch (error) {
      const failure = error instanceof ScheduleError ? error : new ScheduleError(503, 'journal_unavailable')
      json(failure.status, { ok: false, code: failure.code, error: scheduleErrors[failure.code] ?? '操作失败，请刷新状态。' })
    }
  } })
}
