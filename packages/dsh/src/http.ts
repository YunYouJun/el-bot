import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PersonaContext } from './contracts'
import type { PersonaRequest, PersonaService } from './service'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { API_PATH, WEB_PATH } from './service'

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

export function personaRoutes(ctx: PersonaContext, service: PersonaService) {
  return ctx.webServer.register({ kind: 'prefix', path: WEB_PATH, handler: async (req: IncomingMessage, res: ServerResponse) => {
    // Registering a webServer route alone does not authenticate it.
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) {
      json(res, rejection, { ok: false, error: '请先通过 DSH 登录入口连接此机器人。' })
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    if (pathname === API_PATH) {
      try {
        let request: PersonaRequest
        if (req.method === 'GET') {
          request = { operation: 'list' }
        }
        else if (req.method === 'POST' && req.headers['x-el-bot-persona'] === '1' && req.headers['content-type']?.startsWith('application/json')) {
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of req) {
            const bytes = Buffer.from(chunk)
            size += bytes.length
            if (size > 128 * 1024)
              throw new Error('人物卡请求过大。')
            chunks.push(bytes)
          }
          try {
            request = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          }
          catch { throw new Error('人物卡请求不是有效 JSON。') }
        }
        else {
          json(res, 405, { ok: false, error: '不支持的人物卡请求。' })
          return
        }
        json(res, 200, { ok: true, result: await service.request(request, true) })
      }
      catch (error) { json(res, 400, { ok: false, error: error instanceof Error ? error.message : '人物卡操作失败。' }) }
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }
    const relative = pathname.slice(WEB_PATH.length).replace(/^\//, '') || 'index.html'
    if (relative !== 'index.html' && !/^assets\/[\w.-]+$/i.test(relative)) {
      res.writeHead(404).end()
      return
    }
    try {
      const bytes = await readFile(fileURLToPath(new URL(`./web/${relative}`, import.meta.url)))
      const mime = relative.endsWith('.css') ? 'text/css' : relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.svg') ? 'image/svg+xml' : 'text/html'
      res.writeHead(200, {
        'content-type': `${mime}; charset=utf-8`,
        'cache-control': relative === 'index.html' ? 'no-store' : 'private, max-age=86400',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'SAMEORIGIN',
        'content-security-policy': 'default-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'self\'; frame-ancestors \'self\'; base-uri \'none\'',
      })
      res.end(req.method === 'HEAD' ? undefined : bytes)
    }
    catch { res.writeHead(404).end() }
  } })
}
