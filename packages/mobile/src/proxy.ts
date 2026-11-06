import { createServer, request } from 'node:http'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { forwardHTTP, forwardUpgrade } from './web-forward'

const PREFIX = '/el-bot/mobile/v1/'

/** A network-only sidecar: no DSH home mount, credentials, or general RPC route. */
export function createMobileProxy(target = 'http://dsh:3080', webEnabled = false) {
  const origin = new URL(target)
  if (origin.protocol !== 'http:' || origin.username || origin.password)
    throw new Error('Mobile proxy upstream must be a private HTTP origin')
  const server = createServer((req, res) => {
    let pathname: string
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    }
    catch {
      res.writeHead(400, { 'cache-control': 'no-store' }).end()
      return
    }
    if (!pathname.startsWith(PREFIX) && !webEnabled) {
      res.writeHead(404, { 'cache-control': 'no-store' }).end()
      return
    }
    const headers = { ...req.headers }
    for (const key of ['connection', 'upgrade', 'proxy-authorization', 'proxy-connection'])
      delete headers[key]
    if (webEnabled) {
      forwardHTTP(req, res, origin, headers)
      return
    }
    const upstream = request({ hostname: origin.hostname, port: origin.port || 80, method: req.method, path: req.url, headers, timeout: 25_000 }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers)
      response.on('error', () => res.destroy())
      response.pipe(res)
    })
    upstream.on('timeout', () => upstream.destroy())
    upstream.on('error', () => {
      if (res.headersSent) {
        res.destroy()
      }
      else if (!res.destroyed) {
        res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end('{"error":"cloud_unavailable"}')
      }
    })
    req.once('aborted', () => upstream.destroy())
    res.once('close', () => upstream.destroy())
    req.pipe(upstream)
  })
  server.headersTimeout = 10_000
  server.requestTimeout = 20_000
  server.on('upgrade', (req, socket, head) => {
    if (!webEnabled) {
      socket.destroy()
      return
    }
    forwardUpgrade(req, socket, head, origin)
  })
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gateway = process.env.DSH_WEB_GATEWAY
  createMobileProxy(gateway ?? 'http://dsh:3080', !!gateway).listen(3081, '0.0.0.0')
}
