import type { AccountSyncConfig, VerifyIdentityProof } from './account'
import type { AccountDiscoveryConfig, AccountInstance } from './discovery'
import type { QQConversationMetadata, QQGroupDirectory, QQWorkspaceGrouping } from './host'
import type { MobilePersonaService } from './personas'
import type { QQChatService } from './qq-chat'
import type { SessionLifecycleRuntime } from './session-lifecycle'
import type { MobileContext, MobileSettings } from './types'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { adminSocket } from './admin'
import { DeviceStore } from './auth'
import { createContextPolicyReader } from './context'
import { sanitizeInstances } from './discovery'
import { DshMobileHost } from './host'
import { API_PATH, MobileError, mobileRoutes } from './http'
import { PhoneRelay } from './phone'
import { QQChatAdapter } from './qq-chat'
import { SessionLifecycle } from './session-lifecycle'
import { createWebGateway } from './web-gateway'

export { SessionLifecycle }

export const name = 'el-bot-mobile'
export const inject = ['webServer', 'sessionController', 'workspaceRegistry', 'connection', 'tools', 'agents', 'sessions', 'sessionPersistence']

export function profileDirectory(profile = 'cloud') {
  if (!/^[a-z0-9][\w-]{0,63}$/i.test(profile))
    throw new Error('Invalid DSH profile')
  return join(homedir(), '.dsh/profiles', profile)
}

export function apply(ctx: MobileContext, settings: MobileSettings) {
  const origin = new URL(settings.publicBaseUrl)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || (origin.pathname !== '/' && origin.pathname !== ''))
    throw new Error('Mobile publicBaseUrl must be an HTTPS origin')
  const profile = settings.profileDirectory ?? profileDirectory()
  if (!isAbsolute(profile))
    throw new Error('Mobile profileDirectory must be absolute')
  const account = readAccountConfig(settings)
  const discovery = readDiscoveryConfig(settings)
  const webPort = settings.web?.enabled ? (settings.web.port ?? 3082) : undefined
  if (webPort !== undefined && (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535 || webPort === 3080))
    throw new Error('Mobile Web gateway port is invalid')
  ctx.effect(async () => {
    const directory = join(profile, 'el-bot-mobile')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const devices = new DeviceStore(join(directory, 'devices.json'))
    await devices.load()
    const require = createRequire(join(profile, 'package.json'))
    const sdk = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))
    const helpers = await import(pathToFileURL(sdk.resolve('@deepseek-ai/dsh-llm')).href)
    if (typeof helpers.joinAssistantStreamText !== 'function')
      throw new Error('DSH assistant-stream text projection is unavailable')
    if (!['0.2.1-rc.5', '0.2.2-rc.1'].includes(require(require.resolve('@deepseek-ai/dsh/package.json')).version))
      throw new Error('Mobile session management requires DSH 0.2.1-rc.5 or 0.2.2-rc.1')
    const lifecycleRuntime = {
      agents: ctx.get?.('agents'),
      sessions: ctx.get?.('sessions'),
      sessionPersistence: ctx.get?.('sessionPersistence'),
      workspaceRegistry: ctx.workspaceRegistry,
      activity: (id: string) => {
        const host = ctx as unknown as { waterfall: (event: string, payload: { sessionId: string }, next: () => Promise<unknown[]>) => Promise<unknown[]> }
        const chat = ctx.get?.('qqNativeChat') as { activity: (id: string) => Promise<unknown[]> } | undefined
        return Promise.all([host.waterfall('workspace/session-activity', { sessionId: id }, async () => []), chat?.activity(id) ?? []]).then(rows => rows.flat())
      },
      eraseProjectionCache: async (id: string) => {
        const chat = ctx.get?.('qqNativeChat') as { clear?: (id: string) => Promise<void> } | undefined
        await chat?.clear?.(id)
        // rc.5 owns this table. Use its write chain so memory and disk agree.
        const cache = ctx.get?.('sessionProjectionCache') as { table?: { delete: (id: string) => Promise<boolean> } } | undefined
        if (cache) {
          if (typeof cache.table?.delete !== 'function')
            throw new Error('Session projection cache cannot delete records')
          await cache.table.delete(id)
        }
      },
    } as SessionLifecycleRuntime
    const lifecycle = new SessionLifecycle(lifecycleRuntime, join(directory, 'session-lifecycle.json'))
    try {
      await lifecycle.load()
    }
    catch (error) {
      await lifecycle.close()
      throw error
    }
    ctx.effect(async () => async () => {
      await lifecycle.close()
    })
    const scopes = await import(pathToFileURL(sdk.resolve('@deepseek-ai/dsh-scope')).href)
    const contextPolicy = createContextPolicyReader({
      agents: ctx.get?.('agents'),
      persistence: ctx.get?.('sessionPersistence'),
      presets: ctx.get?.('agentPresets'),
      scope: (parent: object) => scopes.createScope(ctx, {}, { parent }),
    } as Parameters<typeof createContextPolicyReader>[0])
    const host = new DshMobileHost(ctx.sessionController, ctx.workspaceRegistry, settings, helpers.joinAssistantStreamText, () => ctx.get?.('qqWorkspaceGrouping') as QQWorkspaceGrouping | undefined, () => ctx.get?.('qqConversationMetadata') as QQConversationMetadata | undefined, lifecycle, () => ctx.get?.('qqGroupDirectory') as QQGroupDirectory | undefined, () => ctx.get?.('qqNativeChat') as QQChatService | undefined, contextPolicy)
    // Failed cleanup remains visible and retryable; it must not disable pairing or recovery UI.
    for (const id of lifecycle.pending) {
      await host.delete(id, AbortSignal.timeout(20_000)).catch(() => {
        console.error('Mobile session cleanup remains pending')
      })
    }
    const qqChat = new QQChatAdapter(join(directory, 'qq-previews.json'), () => ctx.get?.('qqNativeChat') as QQChatService | undefined)
    await qqChat.load()
    ctx.effect(async () => async () => {
      await qqChat.close()
    })
    const phone = settings.phone?.enabled ? new PhoneRelay(devices, host) : undefined
    const unregisterPhone = phone?.register(ctx.tools)
    const closeAdmin = await adminSocket(join(directory, 'admin.sock'), devices)
    const verify = account || discovery ? await createIdentityVerifier() : undefined
    let unregister: (() => void) | undefined
    let restarting = false
    const system = {
      restart: async (force: boolean, signal: AbortSignal) => {
        const exit = ctx.get?.('appExit')
        if (typeof exit !== 'function' || !(process.env.DSH_RESTART_SUPERVISED === '1' || existsSync('/.dockerenv')))
          throw new MobileError(503, 'restart_unavailable')
        if (restarting)
          return
        const running = (await host.list(signal)).filter(row => row.running).length
        if (running > 0 && !force)
          throw new MobileError(409, 'session_active')
        restarting = true
        setTimeout(exit as (code: number) => void, 750, 0)
      },
    }
    const gateway = webPort === undefined
      ? undefined
      : createWebGateway({
          publicOrigin: origin.origin,
          upstream: ctx.webServer.getOrigin(),
          devices,
          authenticatedUrl: base => ctx.connection.authenticatedUrl(base),
        })
    try {
      unregister = ctx.webServer.register({ kind: 'prefix', path: API_PATH, handler: mobileRoutes(host, devices, origin.origin, (error) => {
        const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[\w/-]+$/.test(error.code) ? error.code : 'unknown'
        // Names and codes identify integration failures without logging prompts or credentials.
        console.error('Mobile request failed', error instanceof Error ? error.name : 'Error', code)
      }, account && verify ? { config: account, verify } : undefined, discovery && verify ? { config: discovery, verify } : undefined, phone, () => ctx.get?.('elBotPersonas') as MobilePersonaService | undefined, qqChat, system) })
      if (gateway) {
        await new Promise<void>((resolve, reject) => {
          gateway.server.once('error', reject)
          gateway.server.listen(webPort, '0.0.0.0', () => {
            gateway.server.off('error', reject)
            resolve()
          })
        })
      }
    }
    catch (error) {
      await lifecycle.close()
      unregisterPhone?.()
      phone?.close()
      unregister?.()
      await gateway?.close()
      await closeAdmin()
      throw error
    }
    return async () => {
      await lifecycle.close()
      unregisterPhone?.()
      phone?.close()
      unregister?.()
      await gateway?.close()
      await closeAdmin()
    }
  })
}

function readDiscoveryConfig(settings: MobileSettings): AccountDiscoveryConfig | undefined {
  const value = settings.discovery
  if (!value)
    return undefined
  const account = readAccountConfig({ ...settings, account: value.account })
  if (!account || !value.enrollmentSecret || value.enrollmentSecret.length < 32 || !Array.isArray(value.instances))
    throw new Error('Mobile account discovery settings are incomplete')
  const instances = sanitizeInstances(value.instances)
  const secret = value.enrollmentSecret
  return {
    ...account,
    enrollmentSecret: secret,
    directory: { list: async () => instances as AccountInstance[] },
    tickets: value.tickets
      ? {
          issue: value.tickets.issue,
          sign: value.tickets.sign,
        }
      : undefined,
  }
}

function readAccountConfig(settings: MobileSettings): AccountSyncConfig | undefined {
  const value = settings.account
  if (!value)
    return undefined
  const { cloudbaseEnvId, appId, clientId, issuer, jwksUrl, requiredScope, requireVerifiedPhone } = value
  if (![cloudbaseEnvId, appId, clientId, issuer, jwksUrl].every(item => typeof item === 'string' && item.length > 0))
    throw new Error('Mobile account sync settings are incomplete')
  return {
    cloudbaseEnvId: cloudbaseEnvId!,
    appId: appId!,
    clientId: clientId!,
    issuer: issuer!,
    jwksUrl: jwksUrl!,
    ...requiredScope ? { requiredScope } : {},
    ...requireVerifiedPhone === false ? { requireVerifiedPhone } : {},
  }
}

async function createIdentityVerifier(): Promise<VerifyIdentityProof> {
  const sdk = await import('@yunlefun/sso/server')
  return (proof, config) => sdk.verifySsoIdentityProof(proof, config)
}
