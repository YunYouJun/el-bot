import type { Server } from 'node:http'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { DeviceStore } from './auth'
import { createWebGateway, WEB_LAUNCH_PATH, WEB_TICKET_PATH } from './web-gateway'

function send(url: string, init: { method?: string, headers?: Record<string, string>, body?: string, redirect?: string } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: init.method, headers: init.headers }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.once('error', reject)
      response.once('end', () => {
        const headers = new Headers()
        for (const [key, value] of Object.entries(response.headers)) {
          for (const item of value === undefined ? [] : Array.isArray(value) ? value : [value])
            headers.append(key, item)
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers }))
      })
    })
    request.once('error', reject)
    request.end(init.body)
  })
}

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse())
    await cleanup()
})

async function listen(server: Server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No listener')
  return `http://127.0.0.1:${address.port}`
}

async function fixture() {
  let now = Date.now()
  const directory = await mkdtemp(join(tmpdir(), 'yun-web-gateway-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  const devices = new DeviceStore(join(directory, 'devices.json'), () => now)
  await devices.load()
  const pairing = await devices.createPairing()
  const device = await devices.exchange(pairing.code, 'Phone')
  const requests: { path: string, cookie?: string, authorization?: string, host?: string, origin?: string }[] = []
  const upstream = createServer((req, res) => {
    requests.push({ path: req.url!, cookie: req.headers.cookie, authorization: req.headers.authorization, host: req.headers.host, origin: req.headers.origin })
    if (req.url === '/?token=private-launch-token')
      res.writeHead(303, { 'set-cookie': 'dsh-auth-fixture=private-upstream-cookie; HttpOnly; Path=/', 'location': './' }).end()
    else
      res.writeHead(200, { 'set-cookie': 'dsh-auth-fixture=must-not-reach-browser' }).end('authenticated-web')
  })
  const target = await listen(upstream)
  cleanups.push(async () => {
    upstream.closeAllConnections()
    await new Promise<void>(resolve => upstream.close(() => resolve()))
  })
  const publicOrigin = 'https://bot.example.test'
  const gateway = createWebGateway({ publicOrigin, upstream: target, devices, authenticatedUrl: url => `${url}?token=private-launch-token`, now: () => now })
  const url = await listen(gateway.server)
  cleanups.push(() => gateway.close())
  const headers = { 'host': 'bot.example.test', 'content-type': 'application/json' }
  const ticket = async () => {
    const response = await send(`${url}${WEB_TICKET_PATH}`, { method: 'POST', headers: { ...headers, authorization: `Bearer ${device.token}` }, body: '{"access":"owner-web"}' })
    expect(response.status).toBe(200)
    return await response.json() as { ticket: string, launchUrl: string }
  }
  const launch = async (ticket: string) => send(`${url}${WEB_LAUNCH_PATH}`, { method: 'POST', redirect: 'manual', headers, body: JSON.stringify({ ticket }) })
  return { url, target, upstream, gateway, devices, device, requests, headers, ticket, launch, advance: (ms: number) => {
    now += ms
  } }
}

it('exchanges a one-use device ticket without leaking DSH credentials to the browser', async () => {
  const f = await fixture()
  expect((await send(f.url, { headers: f.headers })).status).toBe(404)
  expect((await send(`${f.url}${WEB_TICKET_PATH}`, { method: 'POST', headers: f.headers, body: '{"access":"owner-web"}' })).status).toBe(401)
  expect(f.requests).toHaveLength(0)
  const ticket = await f.ticket()
  expect(ticket.launchUrl).toBe(`https://bot.example.test${WEB_LAUNCH_PATH}`)
  const launched = await f.launch(ticket.ticket)
  expect(launched.status).toBe(303)
  const cookie = launched.headers.get('set-cookie')!
  expect(cookie).toContain('Secure; HttpOnly; SameSite=Strict')
  expect(cookie).not.toMatch(/private-|dsh-auth-/)
  expect(launched.headers.get('location')).toBe('/')
  expect((await f.launch(ticket.ticket)).status).toBe(401)
  const page = await send(f.url, { headers: { ...f.headers, cookie } })
  expect(await page.text()).toBe('authenticated-web')
  expect(page.headers.get('set-cookie')).toBeNull()
  expect(f.requests.at(-1)).toMatchObject({ cookie: 'dsh-auth-fixture=private-upstream-cookie', host: new URL(f.target).host })
  expect(f.requests.at(-1)?.authorization).toBeUndefined()
  await f.devices.revoke(f.device.device.id)
  expect((await send(f.url, { headers: { ...f.headers, cookie } })).status).toBe(404)
})

it('rejects expired tickets, cross-site requests and query-string credentials', async () => {
  const f = await fixture()
  const ticket = await f.ticket()
  f.advance(60_001)
  expect((await f.launch(ticket.ticket)).status).toBe(401)
  expect((await send(f.url, { headers: { ...f.headers, origin: 'https://evil.example' } })).status).toBe(403)
  expect((await send(`${f.url}/?token=private-launch-token`, { headers: f.headers })).status).toBe(400)
  expect((await send(f.url, { headers: { ...f.headers, host: 'evil.example' } })).status).toBe(403)
  expect(f.requests).toHaveLength(0)
})

it('rotates browser sessions and closes an upgraded connection when the device is revoked', async () => {
  const f = await fixture()
  let upstreamCookie: string | undefined
  f.upstream.on('upgrade', (req, socket) => {
    upstreamCookie = req.headers.cookie
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    socket.on('error', () => {})
    socket.resume()
    cleanups.push(async () => {
      socket.destroy()
    })
  })
  const first = await f.launch((await f.ticket()).ticket)
  const oldCookie = first.headers.get('set-cookie')!
  const second = await f.launch((await f.ticket()).ticket)
  const cookie = second.headers.get('set-cookie')!.split(';', 1)[0]!
  expect((await send(f.url, { headers: { ...f.headers, cookie: oldCookie } })).status).toBe(404)
  const endpoint = new URL(f.url)
  const socket = connect(Number(endpoint.port), '127.0.0.1')
  socket.on('error', () => {})
  cleanups.push(async () => {
    socket.destroy()
  })
  socket.write(`GET /api/remote.mux HTTP/1.1\r\nHost: bot.example.test\r\nOrigin: https://bot.example.test\r\nCookie: ${cookie}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`)
  const [response] = await once(socket, 'data')
  expect(String(response)).toContain('101 Switching Protocols')
  expect(upstreamCookie).toBe('dsh-auth-fixture=private-upstream-cookie')
  const closed = once(socket, 'close')
  await f.devices.revoke(f.device.device.id)
  await closed
}, 5000)
