import type { Buffer } from 'node:buffer'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { request } from 'node:http'

export function forwardHTTP(req: IncomingMessage, res: ServerResponse, target: URL, headers = req.headers, filterCookies = false) {
  const upstream = request({ hostname: target.hostname, port: target.port || 80, method: req.method, path: req.url, headers, timeout: 120_000 }, (response) => {
    const result = { ...response.headers }
    if (filterCookies)
      delete result['set-cookie']
    result['cache-control'] = 'no-store'
    result['referrer-policy'] = 'no-referrer'
    result['x-content-type-options'] = 'nosniff'
    res.writeHead(response.statusCode ?? 502, result)
    response.on('error', () => res.destroy())
    response.pipe(res)
  })
  upstream.on('timeout', () => upstream.destroy())
  upstream.on('error', () => {
    if (!res.headersSent)
      res.writeHead(502, { 'cache-control': 'no-store' }).end('upstream_unavailable')
    else
      res.destroy()
  })
  req.once('aborted', () => upstream.destroy())
  res.once('close', () => upstream.destroy())
  req.pipe(upstream)
}

export function forwardUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, target: URL, headers = req.headers) {
  const upstream = request({ hostname: target.hostname, port: target.port || 80, path: req.url, headers })
  let connected: Duplex | undefined
  const cleanup = () => {
    upstream.destroy()
    connected?.destroy()
  }
  socket.on('error', cleanup)
  socket.once('close', cleanup)
  upstream.once('error', () => socket.destroy())
  upstream.once('response', () => socket.destroy())
  upstream.once('upgrade', (response, remote, pending) => {
    connected = remote
    remote.on('error', () => socket.destroy())
    remote.once('close', () => socket.destroy())
    const lines = [`HTTP/1.1 ${response.statusCode} Switching Protocols`]
    for (const [name, value] of Object.entries(response.headers)) {
      if (name === 'set-cookie' || value === undefined)
        continue
      for (const item of Array.isArray(value) ? value : [String(value)])
        lines.push(`${name}: ${item}`)
    }
    socket.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (pending.length)
      socket.write(pending)
    if (head.length)
      remote.write(head)
    socket.pipe(remote).pipe(socket)
  })
  upstream.end()
}
