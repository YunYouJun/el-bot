import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { DeviceStore } from './auth'
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { isIP } from 'node:net'
import { API_PATH, body, json, MobileError } from './http'
import { forwardHTTP, forwardUpgrade } from './web-forward'

export const WEB_TICKET_PATH = `${API_PATH}/web/ticket`
export const WEB_LAUNCH_PATH = `${API_PATH}/web/launch`
const COOKIE = '__Host-yun-dsh-web'
const TICKET_TTL = 60_000
const SESSION_TTL = 7 * 24 * 60 * 60_000
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

function privateListener(host: string) {
  if (isIP(host) !== 4)
    return false
  const [a, b] = host.split('.').map(Number)
  return a === 127 || a === 10 || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168)
}

interface Grant { deviceId: string, expiresAt: number }
interface BrowserGrant extends Grant { upstreamCookie: string }

export interface WebGatewayOptions {
  publicOrigin: string
  upstream: string
  devices: DeviceStore
  authenticatedUrl: (base: string) => string
  now?: () => number
}

/** The DSH launch token and browser cookie never leave this server process. */
export function createWebGateway(options: WebGatewayOptions) {
  const origin = new URL(options.publicOrigin)
  const target = new URL(options.upstream)
  if (origin.protocol !== 'https:' || origin.origin !== options.publicOrigin
    || target.protocol !== 'http:' || !privateListener(target.hostname) || target.pathname !== '/' || target.search || target.hash || target.username || target.password) {
    throw new Error('Web gateway requires a public HTTPS origin and a private listener IP')
  }
  const now = options.now ?? Date.now
  const tickets = new Map<string, Grant>()
  const sessions = new Map<string, BrowserGrant>()
  const sockets = new Map<Duplex, BrowserGrant>()
  const responses = new Map<ServerResponse, BrowserGrant>()
  const active = (grant: Grant) => grant.expiresAt > now() && options.devices.list().some(device => device.id === grant.deviceId)
  const prune = () => {
    for (const grants of [tickets, sessions]) {
      for (const [key, grant] of grants) {
        if (!active(grant))
          grants.delete(key)
      }
    }
    for (const [socket, grant] of sockets) {
      if (!active(grant))
        socket.destroy()
    }
    for (const [response, grant] of responses) {
      if (!active(grant))
        response.destroy()
    }
  }
  const trusted = (req: IncomingMessage, requireOrigin = false) => req.headers.host === origin.host
    && req.headers['sec-fetch-site'] !== 'cross-site'
    && (req.headers.origin === origin.origin || (!requireOrigin && req.headers.origin === undefined))
  const browser = (req: IncomingMessage): BrowserGrant | undefined => {
    const cookies = (req.headers.cookie ?? '').split(';').map(value => value.trim())
    const matches = cookies.filter(value => value.startsWith(`${COOKIE}=`))
    if (matches.length !== 1)
      return
    const value = matches[0]!.slice(COOKIE.length + 1)
    if (!/^[\w-]{43}$/.test(value))
      return
    const grant = sessions.get(digest(value))
    return grant && active(grant) ? grant : undefined
  }
  const privateHeaders = (req: IncomingMessage, grant?: BrowserGrant): IncomingHttpHeaders => {
    const headers: IncomingHttpHeaders = { ...req.headers, host: target.host }
    for (const name of ['authorization', 'cookie', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for', 'proxy-authorization'])
      delete headers[name]
    if (req.headers.origin)
      headers.origin = target.origin
    if (grant)
      headers.cookie = grant.upstreamCookie
    return headers
  }
  const server = createServer(async (req, res) => {
    try {
      prune()
      if (!trusted(req))
        throw new MobileError(403, 'origin_rejected')
      const url = new URL(req.url ?? '/', origin)
      if (url.searchParams.has('token'))
        throw new MobileError(400, 'url_credential_rejected')
      if (url.pathname === WEB_TICKET_PATH) {
        if (req.method !== 'POST')
          throw new MobileError(405, 'method_not_allowed')
        const device = options.devices.authorize(req.headers.authorization)
        if (!device)
          throw new MobileError(401, 'unauthorized')
        const request = await body(req)
        if (request.access !== 'owner-web')
          throw new MobileError(400, 'web_access_required')
        // One outstanding launch per device, with a hard global bound.
        for (const [key, grant] of tickets) {
          if (grant.deviceId === device.id)
            tickets.delete(key)
        }
        if (tickets.size >= 20)
          throw new MobileError(429, 'ticket_limit')
        const ticket = randomBytes(32).toString('base64url')
        const expiresAt = Math.min(now() + TICKET_TTL, Date.parse(device.expiresAt))
        tickets.set(digest(ticket), { deviceId: device.id, expiresAt })
        json(res, 200, { ticket, expiresAt: new Date(expiresAt).toISOString(), launchUrl: `${origin.origin}${WEB_LAUNCH_PATH}` })
        return
      }
      if (url.pathname === WEB_LAUNCH_PATH) {
        if (req.method !== 'POST')
          throw new MobileError(405, 'method_not_allowed')
        const request = await body(req)
        if (typeof request.ticket !== 'string' || !/^[\w-]{43}$/.test(request.ticket))
          throw new MobileError(401, 'invalid_web_ticket')
        const key = digest(request.ticket)
        const grant = tickets.get(key)
        tickets.delete(key)
        if (!grant || !active(grant))
          throw new MobileError(401, 'invalid_web_ticket')
        const authenticated = new URL(options.authenticatedUrl(target.href))
        if (authenticated.origin !== target.origin || authenticated.pathname !== '/')
          throw new MobileError(503, 'web_auth_unavailable')
        const response = await fetch(authenticated, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
        await response.body?.cancel()
        const upstreamCookie = response.headers.getSetCookie().filter(value => /^dsh-auth-[\w-]+=/.test(value)).map(value => value.split(';', 1)[0]).join('; ')
        if (response.status !== 303 || !upstreamCookie || !active(grant))
          throw new MobileError(503, 'web_auth_unavailable')
        for (const [key, session] of sessions) {
          if (session.deviceId === grant.deviceId)
            sessions.delete(key)
        }
        // Replaced sessions must also lose any already-open transport.
        for (const [socket, session] of sockets) {
          if (session.deviceId === grant.deviceId)
            socket.destroy()
        }
        for (const [response, session] of responses) {
          if (session.deviceId === grant.deviceId)
            response.destroy()
        }
        const session = randomBytes(32).toString('base64url')
        const device = options.devices.list().find(device => device.id === grant.deviceId)!
        const expiresAt = Math.min(now() + SESSION_TTL, Date.parse(device.expiresAt))
        sessions.set(digest(session), { deviceId: grant.deviceId, expiresAt, upstreamCookie })
        res.writeHead(303, {
          'location': '/',
          'cache-control': 'no-store',
          'referrer-policy': 'no-referrer',
          'set-cookie': `${COOKIE}=${session}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((expiresAt - now()) / 1000)}`,
        }).end()
        return
      }
      if (url.pathname.startsWith(`${API_PATH}/`)) {
        // The existing native API retains its own Bearer authentication.
        forwardHTTP(req, res, target, req.headers)
        return
      }
      const grant = browser(req)
      if (!grant) {
        res.writeHead(404, { 'cache-control': 'no-store' }).end()
        return
      }
      if (url.pathname === '/connect')
        throw new MobileError(404, 'not_found')
      responses.set(res, grant)
      res.once('close', () => responses.delete(res))
      forwardHTTP(req, res, target, privateHeaders(req, grant), true)
    }
    catch (error) {
      if (!res.headersSent)
        json(res, error instanceof MobileError ? error.status : 503, { error: error instanceof MobileError ? error.code : 'web_unavailable' })
      else
        res.destroy()
    }
  })
  server.headersTimeout = 10_000
  server.requestTimeout = 120_000
  server.on('upgrade', (req, socket, head) => {
    const grant = browser(req)
    if (!trusted(req, true) || !grant || !req.url?.startsWith('/api/')) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      return
    }
    sockets.set(socket, grant)
    socket.once('close', () => sockets.delete(socket))
    forwardUpgrade(req, socket, head, target, privateHeaders(req, grant))
  })
  const timer = setInterval(prune, 1000)
  timer.unref()
  server.once('close', () => clearInterval(timer))
  return {
    server,
    close: async () => {
      clearInterval(timer)
      for (const socket of sockets.keys())
        socket.destroy()
      for (const response of responses.keys())
        response.destroy()
      tickets.clear()
      sessions.clear()
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}
