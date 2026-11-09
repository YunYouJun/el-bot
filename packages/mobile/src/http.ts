import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AccountSyncConfig, VerifyIdentityProof } from './account'
import type { DeviceStore } from './auth'
import type { AccountDiscoveryConfig, AccountEnrollmentResult, AccountInstance } from './discovery'
import type { ReminderNotifications } from './notifications'
import type { MobilePersonaService } from './personas'
import type { PhoneRelay } from './phone'
import type { QQChatAdapter } from './qq-chat'
import type { MobileHost } from './types'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { accountPublicState, linkAccount, normalizePreferences } from './account'
import { discoverInstances, verifyEnrollmentTicket } from './discovery'
import { personaRequest } from './personas'

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

export async function body(req: IncomingMessage, limit = 20 * 1024): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new MobileError(415, 'json_required')
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk)
    length += bytes.length
    if (length > limit)
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

function accountProof(value: Record<string, unknown>) {
  if (typeof value.accessToken !== 'string' || value.accessToken.length < 16 || value.accessToken.length > 8192
    || typeof value.identityAssertion !== 'string' || value.identityAssertion.length < 64 || value.identityAssertion.length > 8192
    || typeof value.nonce !== 'string' || !/^[\w-]{32,128}$/.test(value.nonce)) {
    throw new MobileError(400, 'invalid_account_proof')
  }
  return {
    accessToken: value.accessToken,
    identityAssertion: value.identityAssertion,
    nonce: value.nonce,
  }
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w-]{1,128}$/.test(value))
    throw new MobileError(400, 'invalid_identifier')
  return value
}

function routeIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][\w.:/@+-]{0,199}$/i.test(value))
    throw new MobileError(400, 'invalid_model')
  return value
}

function accountError(error: unknown): MobileError | undefined {
  const code = (error as NodeJS.ErrnoException).code ?? (error instanceof Error ? error.message : '')
  if (code === 'NOT_CONFIGURED' || code === 'account_not_configured')
    return new MobileError(503, 'not_configured')
  if (code === 'SERVICE_UNAVAILABLE')
    return new MobileError(503, 'service_unavailable')
  if (code === 'AUTH_REQUIRED')
    return new MobileError(401, 'auth_required')
  if (code === 'FORBIDDEN')
    return new MobileError(403, 'forbidden')
  if (code === 'INVALID_INPUT' || code === 'invalid_account_proof' || code === 'invalid_enrollment')
    return new MobileError(400, 'invalid_account_proof')
  return undefined
}

interface DirectoryRoutes {
  config: AccountDiscoveryConfig
  verify: VerifyIdentityProof
  now?: () => number
  redeem?: (ticket: string, enrollment: Omit<AccountEnrollmentResult, 'ticket' | 'expiresAt'>) => Promise<unknown>
}

async function redeemSignedTicket(
  ticket: string,
  userId: string,
  instance: AccountInstance,
  deviceName: string,
  directory: DirectoryRoutes,
  clientId?: string,
) {
  if (!directory.config.tickets)
    throw new MobileError(503, 'account_not_configured')
  const signed = await directory.config.tickets.sign(userId, instance, deviceName, clientId)
  if (signed !== ticket)
    throw new MobileError(400, 'invalid_enrollment')
  if (!directory.redeem)
    throw new MobileError(503, 'account_not_configured')
  return directory.redeem(signed, { instance, deviceName })
}

/** No native DSH credentials, filesystem methods or general Remote calls are exposed here. */
export function mobileRoutes(
  host: MobileHost,
  devices: DeviceStore,
  publicOrigin: string,
  reportError: (error: unknown) => void = () => {},
  account?: {
    config?: AccountSyncConfig
    verify?: VerifyIdentityProof
  },
  directory?: {
    config: AccountDiscoveryConfig
    verify: VerifyIdentityProof
    redeem?: (ticket: string, enrollment: Omit<AccountEnrollmentResult, 'ticket' | 'expiresAt'>) => Promise<unknown>
    now?: () => number
  },
  phone?: PhoneRelay,
  personas?: () => MobilePersonaService | undefined,
  qqChat?: QQChatAdapter,
  system?: { restart: (force: boolean, signal: AbortSignal) => Promise<void> },
  notifications?: ReminderNotifications,
) {
  const deletions = new Map<string, { deviceId: string, sessionId: string, updatedAt: string, expiresAt: number }>()
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
        const ticket = request.ticket ?? request.enrollmentTicket
        if ((ticket !== undefined && typeof request.instanceId !== 'string')
          || (ticket === undefined && (typeof request.code !== 'string' || request.code.length > 32))
          || (ticket !== undefined && typeof ticket !== 'string')
          || typeof request.deviceName !== 'string' || request.deviceName.length > 128) {
          throw new MobileError(400, 'invalid_pairing')
        }
        try {
          if (ticket !== undefined) {
            if (!directory)
              throw new MobileError(503, 'account_not_configured')
            const discovery = await discoverInstances(accountProof(request), directory.config, directory.verify, directory.now)
            const instance = discovery.instances.find(item => item.id === request.instanceId && item.publicOrigin === publicOrigin)
            if (!instance)
              throw new MobileError(404, 'instance_not_found')
            const claims = verifyEnrollmentTicket(ticket, instance.id, directory.config, directory.now)
            const result = directory.config.tickets
              ? await redeemSignedTicket(ticket, claims.userId, instance, claims.deviceName, directory, claims.clientId)
              : await (directory.redeem
                  ? directory.redeem(ticket, { instance, deviceName: claims.deviceName })
                  : devices.enroll(ticket, instance.id, directory.config, directory.now))
            json(res, 200, result)
          }
          else { json(res, 200, await devices.exchange(request.code as string, request.deviceName as string)) }
        }
        catch (error) {
          if (error instanceof MobileError)
            throw error
          const mapped = accountError(error)
          if (mapped)
            throw mapped
          const code = error instanceof Error ? error.message : 'invalid_pairing'
          if (code === 'pairing_rate_limited' && ticket === undefined)
            throw new MobileError(429, code)
          if (code === 'device_limit')
            throw new MobileError(409, code)
          if (code === 'invalid_pairing')
            throw new MobileError(401, code)
          if (code === 'invalid_enrollment')
            throw new MobileError(400, code)
          throw error
        }
        return
      }
      if (path.length === 2 && path[0] === 'account' && path[1] === 'instances' && req.method === 'POST') {
        if (!directory)
          throw new MobileError(503, 'account_not_configured')
        const request = await body(req)
        try {
          const result = await discoverInstances(accountProof(request), directory.config, directory.verify, directory.now)
          const proof = accountProof(request)
          const tickets = directory.config.tickets
            ? await directory.config.tickets.issue(proof, result.instances, typeof request.deviceName === 'string' ? request.deviceName : '')
            : {}
          const instances = result.instances.map(instance => ({
            ...instance,
            ...tickets[instance.id]
              ? { enrollmentTicket: tickets[instance.id], expiresAt: new Date((directory.now?.() ?? Date.now()) + 60_000).toISOString() }
              : {},
          }))
          json(res, 200, { instances })
        }
        catch (error) {
          throw accountError(error) ?? error
        }
        return
      }
      const device = devices.authorize(req.headers.authorization)
      if (!device)
        throw new MobileError(401, 'unauthorized')
      if (path.length === 1 && path[0] === 'notifications') {
        if (!notifications)
          throw new MobileError(503, 'notifications_not_configured')
        if (req.method === 'GET')
          json(res, 200, notifications.status(device.id))
        else if (req.method === 'PUT')
          json(res, 200, await notifications.register(device.id, await body(req)))
        else if (req.method === 'DELETE')
          json(res, 200, await notifications.unregister(device.id))
        else throw new MobileError(405, 'method_not_allowed')
        return
      }
      if (path.length === 1 && path[0] === 'personas') {
        if (req.method !== 'GET' && req.method !== 'POST')
          throw new MobileError(405, 'method_not_allowed')
        const service = personas?.()
        if (!service)
          throw new MobileError(503, 'personas_not_configured')
        // JSON escapes can expand a 32 KiB card sixfold; other routes keep their smaller limit.
        const request = req.method === 'GET' ? { operation: 'list' as const } : personaRequest(await body(req, 256 * 1024))
        try {
          json(res, 200, await service.request(request, true))
        }
        catch (error) {
          reportError(error)
          throw new MobileError(400, 'persona_operation_failed')
        }
        return
      }
      if (path[0] === 'phone') {
        if (!phone)
          throw new MobileError(503, 'phone_not_configured')
        const channel = typeof req.headers['x-yun-phone-channel'] === 'string' ? req.headers['x-yun-phone-channel'] : undefined
        if (path.length === 2 && path[1] === 'channel' && req.method === 'POST') {
          const request = await body(req)
          json(res, 201, await phone.open(device.id, identifier(request.requestId), request.apps))
        }
        else if (path.length === 2 && path[1] === 'channel' && req.method === 'DELETE') {
          if (!channel)
            throw new MobileError(403, 'phone_channel_required')
          phone.stop(device.id, channel)
          json(res, 200, { ok: true })
        }
        else if (path.length === 2 && path[1] === 'next' && req.method === 'GET') {
          json(res, 200, phone.next(device.id, channel))
        }
        else if (path.length === 2 && path[1] === 'results' && req.method === 'POST') {
          json(res, 200, phone.complete(device.id, channel, await body(req)))
        }
        else { throw new MobileError(404, 'not_found') }
        return
      }
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
      if (path.length === 2 && path[0] === 'system' && path[1] === 'restart' && req.method === 'POST') {
        if (!system)
          throw new MobileError(503, 'restart_unavailable')
        const request = await body(req)
        if (request.force !== undefined && typeof request.force !== 'boolean')
          throw new MobileError(400, 'invalid_restart')
        await system.restart(request.force === true, signal)
        json(res, 202, { ok: true, restarting: true })
        return
      }
      if (path[0] === 'account') {
        const config = account?.config
        if (!config)
          throw new MobileError(503, 'account_not_configured')
        if (!account?.verify)
          throw new MobileError(503, 'account_not_configured')
        if (path.length === 1 && req.method === 'GET') {
          const state = accountPublicState(config, devices.account())
          json(res, 200, {
            ...state,
            ...directory
              ? {
                  discovery: {
                    enabled: true,
                    canEnroll: !!directory.config.tickets,
                  },
                }
              : {},
          })
          return
        }
        if (path.length === 2 && path[1] === 'link' && req.method === 'POST') {
          const request = await body(req)
          let result
          try {
            result = await linkAccount(
              accountProof(request),
              request.preferences,
              config,
              {
                get account() { return devices.account() },
                commit: value => devices.setAccount(value),
              },
              account!.verify!,
            )
          }
          catch (error) {
            throw accountError(error) ?? error
          }
          json(res, 200, result)
          return
        }
        if (path.length === 2 && path[1] === 'preferences' && req.method === 'PUT') {
          const current = devices.account()
          if (!current)
            throw new MobileError(403, 'account_not_linked')
          const request = await body(req)
          const updated = { ...current, preferences: normalizePreferences(request) }
          await devices.setAccount(updated)
          json(res, 200, updated.preferences)
          return
        }
        if (path.length === 1 && req.method === 'DELETE') {
          await devices.setAccount(undefined)
          json(res, 200, { ok: true })
          return
        }
        throw new MobileError(405, 'method_not_allowed')
      }
      if (path[0] === 'groups') {
        if (path.length === 1 && req.method === 'GET') {
          if (!host.groups)
            throw new MobileError(503, 'groups_unavailable')
          json(res, 200, { items: await host.groups(signal) })
          return
        }
        if (path.length === 3 && path[2] === 'conversation' && req.method === 'POST') {
          if (!host.openGroup)
            throw new MobileError(503, 'groups_unavailable')
          json(res, 200, { sessionId: await host.openGroup(identifier(path[1]), signal) })
          return
        }
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
        if (path.length === 5 && path[2] === 'qq' && path[3] === 'members') {
          if (req.method !== 'GET')
            throw new MobileError(405, 'method_not_allowed')
          if (!qqChat)
            throw new MobileError(503, 'qq_chat_unavailable')
          const session = (await host.list(signal)).find(row => row.id === id)
          if (!session || session.source?.platform !== 'qq' || session.source.kind !== 'group')
            throw new MobileError(404, 'session_not_found')
          const senderId = identifier(path[4])
          const value = await qqChat.member(id, senderId)
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new MobileError(503, 'invalid_qq_response')
          json(res, 200, value)
          return
        }
        if (path.length === 3 && path[2] === 'qq') {
          if (!qqChat)
            throw new MobileError(503, 'qq_chat_unavailable')
          const session = (await host.list(signal)).find(row => row.id === id)
          if (!session || session.source?.platform !== 'qq' || session.source.kind !== 'group')
            throw new MobileError(404, 'session_not_found')
          if (req.method === 'GET') {
            const before = url.searchParams.get('before')
            const cursor = before === null ? undefined : Number(before)
            if (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor < 0))
              throw new MobileError(400, 'invalid_cursor')
            const state = await qqChat.view(id, cursor)
            if (!state || typeof state !== 'object' || Array.isArray(state))
              throw new MobileError(503, 'invalid_qq_response')
            json(res, 200, { ...state, ...session.context ? { context: session.context } : {} })
          }
          else if (req.method === 'POST') {
            if (session.archived || session.readOnly)
              throw new MobileError(409, 'stale_session')
            json(res, 200, await qqChat.request(device.id, id, await body(req, 8 * 1024)))
          }
          else {
            throw new MobileError(405, 'method_not_allowed')
          }
          return
        }
        if (path.length === 3 && path[2] === 'archive' && req.method === 'PUT') {
          if (!host.archive)
            throw new MobileError(503, 'session_management_unavailable')
          const request = await body(req)
          if (typeof request.archived !== 'boolean')
            throw new MobileError(400, 'invalid_archive_state')
          await host.archive(id, request.archived, signal)
          json(res, 200, { ok: true })
          return
        }
        if (path.length === 3 && path[2] === 'deletion' && req.method === 'POST') {
          if (!host.delete)
            throw new MobileError(503, 'session_management_unavailable')
          const session = (await host.list(signal)).find(row => row.id === id)
          if (!session)
            throw new MobileError(404, 'session_not_found')
          if (session.running)
            throw new MobileError(409, 'session_active')
          for (const [token, preview] of deletions) {
            if (preview.expiresAt <= Date.now())
              deletions.delete(token)
          }
          if (deletions.size >= 200)
            throw new MobileError(429, 'confirmation_limit')
          const confirmation = randomUUID()
          const expiresAt = Date.now() + 60_000
          deletions.set(confirmation, { deviceId: device.id, sessionId: id, updatedAt: session.updatedAt, expiresAt })
          json(res, 200, { confirmation, expiresAt: new Date(expiresAt).toISOString() })
          return
        }
        if (path.length === 2 && req.method === 'DELETE') {
          if (!host.delete)
            throw new MobileError(503, 'session_management_unavailable')
          const request = await body(req)
          const confirmation = identifier(request.confirmation)
          const preview = deletions.get(confirmation)
          if (!preview || preview.deviceId !== device.id || preview.sessionId !== id || preview.expiresAt <= Date.now())
            throw new MobileError(409, 'confirmation_expired')
          const session = (await host.list(signal)).find(row => row.id === id)
          if (!session)
            throw new MobileError(404, 'session_not_found')
          if (session.running)
            throw new MobileError(409, 'session_active')
          if (session.updatedAt !== preview.updatedAt)
            throw new MobileError(409, 'session_changed')
          deletions.delete(confirmation)
          await host.delete(id, signal)
          json(res, 200, { ok: true })
          return
        }
        if (path.length === 3 && path[2] === 'info' && req.method === 'GET') {
          if (!host.information)
            throw new MobileError(503, 'information_unavailable')
          json(res, 200, await host.information(id, signal))
          return
        }
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
        if (path.length === 3 && path[2] === 'models') {
          if (req.method !== 'GET')
            throw new MobileError(405, 'method_not_allowed')
          json(res, 200, await host.models(id, signal))
          return
        }
        if (path.length === 3 && path[2] === 'model') {
          if (req.method !== 'PUT')
            throw new MobileError(405, 'method_not_allowed')
          const request = await body(req)
          const provider = routeIdentifier(request.provider)
          const model = routeIdentifier(request.model)
          const reasoningEffort = request.reasoningEffort === undefined
            ? undefined
            : routeIdentifier(request.reasoningEffort)
          const selected = await host.selectModel(id, {
            provider,
            model,
            ...reasoningEffort ? { reasoningEffort } : {},
          }, signal)
          json(res, 200, { selected })
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
