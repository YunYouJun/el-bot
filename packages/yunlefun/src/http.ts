import type { IncomingMessage, ServerResponse } from 'node:http'
import type { YunlefunService } from './service'
import { Buffer } from 'node:buffer'
import { panel, script } from './panel'
import { object, YunlefunError } from './protocol'

export const WEB_PATH = '/el-bot/ai'
function allowedOrigin(origin: string | undefined, host: string | undefined, publicOrigin: string, transportOrigin?: string) {
  if (origin === undefined || origin === publicOrigin)
    return true
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && (origin === transportOrigin || ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) && url.host === host && url.origin === origin
  }
  catch {
    return false
  }
}
export function routes(service: YunlefunService, reject: (request: IncomingMessage) => number | undefined, publicOrigin: string, changed: () => void, transportOrigin?: string) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(data))
    }
    const rejection = reject(req)
    if (rejection !== undefined) {
      json(rejection, { error: 'AUTH_REQUIRED' })
      return
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path === `${WEB_PATH}/api`) {
      if (req.method !== 'POST' || req.headers['x-el-bot-ai'] !== '1' || !req.headers['content-type']?.startsWith('application/json') || req.headers['sec-fetch-site'] === 'cross-site' || !allowedOrigin(req.headers.origin, req.headers.host, publicOrigin, transportOrigin)) {
        json(403, { error: 'REQUEST_DENIED' })
        return
      }
      try {
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of req) {
          const buffer = Buffer.from(chunk)
          size += buffer.length
          if (size > 4096)
            throw new YunlefunError('REQUEST_TOO_LARGE', 413)
          chunks.push(buffer)
        }
        const input = object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        const keys = input.action === 'start' ? ['action', 'consent'] : input.action === 'recover' || input.action === 'cancel' ? ['action', 'requestId'] : ['action']
        if (Object.keys(input).sort().join(':') !== keys.sort().join(':'))
          throw new YunlefunError('INVALID_REQUEST')
        let result: unknown
        switch (input.action) {
          case 'status':
            result = await service.status()
            break
          case 'start':
            result = await service.start(input.consent)
            break
          case 'poll':
            result = await service.poll()
            changed()
            break
          case 'catalog':
            result = await service.catalog()
            changed()
            break
          case 'recover':
          case 'cancel':
            if (typeof input.requestId !== 'string' || !/^[\w-]{1,128}$/.test(input.requestId))
              throw new YunlefunError('INVALID_REQUEST')
            result = await service.recover(input.requestId, input.action === 'cancel')
            break
          case 'disconnect':
            result = await service.disconnect()
            changed()
            break
          default: throw new YunlefunError('INVALID_REQUEST')
        }
        json(200, result)
      }
      catch (error) {
        json(error instanceof YunlefunError ? error.status : 400, { error: error instanceof YunlefunError ? error.code : 'INVALID_REQUEST' })
      }
      return
    }
    if (!['GET', 'HEAD'].includes(req.method ?? '') || ![WEB_PATH, `${WEB_PATH}/`, `${WEB_PATH}/panel.js`].includes(path)) {
      res.writeHead(404).end()
      return
    }
    const javascript = path.endsWith('/panel.js')
    res.writeHead(200, { 'content-type': `${javascript ? 'text/javascript' : 'text/html'}; charset=utf-8`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': 'default-src \'self\'; script-src \'self\'; style-src \'unsafe-inline\'; connect-src \'self\'; frame-ancestors \'self\'; base-uri \'none\'; form-action \'none\'' })
    res.end(req.method === 'HEAD' ? undefined : javascript ? script : panel)
  }
}
