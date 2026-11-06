import type { PersonaContext } from '../contracts'
import type { ManualControl } from './manual'
import type { ManualRequest } from './manual-types'
import { Buffer } from 'node:buffer'
import { panelAsset } from '../http'
import { ManualError, manualErrors } from './manual-types'

export const MANUAL_PATH = '/el-bot/manual'

/** The existing owner-cookie, Host and Origin check is mandatory on every request. */
export function manualRoutes(ctx: Pick<PersonaContext, 'webServer' | 'connection'>, control: ManualControl) {
  return ctx.webServer.register({ kind: 'prefix', path: MANUAL_PATH, handler: async (req, res) => {
    const json = (status: number, value: unknown) => {
      if (res.destroyed || res.writableEnded)
        return
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      res.end(JSON.stringify(value))
    }
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) {
      json(rejection, { ok: false, error: '只有通过 DSH 登录的主人才能手动接管。' })
      return
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path !== `${MANUAL_PATH}/api`) {
      await panelAsset(req, res, MANUAL_PATH)
      return
    }
    try {
      let input: ManualRequest
      if (req.method === 'GET') {
        input = { operation: 'list' }
      }
      else if (req.method === 'POST' && req.headers['x-el-bot-manual'] === '1' && req.headers['content-type']?.startsWith('application/json')) {
        req.setTimeout(40_000, () => req.destroy())
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk)
          if (size > 8 * 1024)
            throw new ManualError(413, 'invalid_request')
          chunks.push(Buffer.from(chunk))
        }
        try {
          input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        }
        catch { throw new ManualError(400, 'invalid_request') }
      }
      else {
        json(405, { ok: false, error: '不支持的接管请求。' })
        return
      }
      json(200, { ok: true, result: await control.request(input) })
    }
    catch (error) {
      const failure = error instanceof ManualError ? error : new ManualError(503, 'journal_unavailable')
      json(failure.status, { ok: false, code: failure.code, error: manualErrors[failure.code] ?? '操作失败，请刷新状态。' })
    }
  } })
}
