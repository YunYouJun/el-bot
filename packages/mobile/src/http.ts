import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DeviceStore } from './auth'
import type { MobileHost } from './types'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

export const API_PATH = '/el-bot/mobile/v1'

export class MobileError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}

export function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  res.end(JSON.stringify(value))
}

export async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new MobileError(415, 'json_required')
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk)
    length += bytes.length
    if (length > 20 * 1024)
      throw new MobileError(413, 'request_too_large')
    chunks.push(bytes)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('object_required')
    return value as Record<string, unknown>
  }
  catch { throw new MobileError(400, 'invalid_json') }
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w-]{1,128}$/.test(value))
    throw new MobileError(400, 'invalid_identifier')
  return value
}

/** No native DSH credentials, filesystem methods or general Remote calls are exposed here. */
export function mobileRoutes(host: MobileHost, devices: DeviceStore, publicOrigin: string, reportError: (error: unknown) => void = () => {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    req.setTimeout(10_000, () => req.destroy())
    res.setHeader('x-request-id', randomUUID())
    const cancellation = new AbortController()
    const abort = () => cancellation.abort()
    res.once('close', abort)
    req.once('aborted', abort)
    const signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(20_000)])
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (!url.pathname.startsWith(`${API_PATH}/`))
        throw new MobileError(404, 'not_found')
      if (req.headers.origin && req.headers.origin !== publicOrigin)
        throw new MobileError(403, 'origin_rejected')
      const path = url.pathname.slice(API_PATH.length + 1).split('/').map(decodeURIComponent)
      if (path.length === 1 && path[0] === 'pair' && req.method === 'POST') {
        const request = await body(req)
        if (typeof request.code !== 'string' || request.code.length > 32 || typeof request.deviceName !== 'string' || request.deviceName.length > 128)
          throw new MobileError(400, 'invalid_pairing')
        try {
          json(res, 200, await devices.exchange(request.code, request.deviceName))
        }
        catch (error) {
          const code = error instanceof Error ? error.message : 'invalid_pairing'
          if (code === 'pairing_rate_limited')
            throw new MobileError(429, code)
          if (code === 'device_limit')
            throw new MobileError(409, code)
          if (code === 'invalid_pairing')
            throw new MobileError(401, code)
          throw error
        }
        return
      }
      const device = devices.authorize(req.headers.authorization)
      if (!device)
        throw new MobileError(401, 'unauthorized')
      if (path.length === 1 && path[0] === 'device') {
        if (req.method === 'GET') {
          json(res, 200, device)
        }
        else if (req.method === 'DELETE') {
          await devices.revoke(device.id)
          json(res, 200, { ok: true })
        }
        else { throw new MobileError(405, 'method_not_allowed') }
        return
      }
      if (path.length === 1 && path[0] === 'status' && req.method === 'GET') {
        json(res, 200, await host.status())
        return
      }
      if (path[0] === 'sessions') {
        if (path.length === 1) {
          if (req.method === 'GET') {
            json(res, 200, { items: (await host.list(signal)).slice(0, 200) })
          }
          else if (req.method === 'POST') {
            const request = await body(req)
            json(res, 201, { sessionId: await host.create(identifier(request.requestId)) })
          }
          else { throw new MobileError(405, 'method_not_allowed') }
          return
        }
        const id = identifier(path[1])
        if (path.length === 2 && req.method === 'GET') {
          const before = url.searchParams.get('before')
          const cursor = before === null ? undefined : Number(before)
          if (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor < 0))
            throw new MobileError(400, 'invalid_cursor')
          json(res, 200, await host.conversation(id, signal, cursor))
          return
        }
        if (path.length === 3 && path[2] === 'messages' && req.method === 'POST') {
          const request = await body(req)
          if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 4000)
            throw new MobileError(400, 'invalid_prompt')
          await host.prompt(id, request.text, identifier(request.requestId), signal)
          json(res, 202, { accepted: true })
          return
        }
      }
      throw new MobileError(404, 'not_found')
    }
    catch (error) {
      if (!(error instanceof MobileError))
        reportError(error)
      if (res.destroyed || res.writableEnded)
        return
      const failure = error instanceof MobileError ? error : new MobileError(503, 'cloud_unavailable')
      json(res, failure.status, { error: failure.code })
    }
    finally {
      res.removeListener('close', abort)
      req.removeListener('aborted', abort)
    }
  }
}
