import type { AccountSyncConfig, VerifyIdentityProof } from './account'
import type { AccountDiscoveryConfig, AccountInstance } from './discovery'
import type { QQConversationMetadata, QQWorkspaceGrouping } from './host'
import type { MobileContext, MobileSettings } from './types'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { adminSocket } from './admin'
import { DeviceStore } from './auth'
import { sanitizeInstances } from './discovery'
import { DshMobileHost } from './host'
import { API_PATH, mobileRoutes } from './http'
import { PhoneRelay } from './phone'
import { createWebGateway } from './web-gateway'

export const name = 'el-bot-mobile'
export const inject = ['webServer', 'sessionController', 'workspaceRegistry', 'connection', 'tools']

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
    const host = new DshMobileHost(ctx.sessionController, ctx.workspaceRegistry, settings, helpers.joinAssistantStreamText, () => ctx.get?.('qqWorkspaceGrouping') as QQWorkspaceGrouping | undefined, () => ctx.get?.('qqConversationMetadata') as QQConversationMetadata | undefined)
    const phone = settings.phone?.enabled ? new PhoneRelay(devices, host) : undefined
    const unregisterPhone = phone?.register(ctx.tools)
    const closeAdmin = await adminSocket(join(directory, 'admin.sock'), devices)
    const verify = account || discovery ? await createIdentityVerifier() : undefined
    let unregister: (() => void) | undefined
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
      }, account && verify ? { config: account, verify } : undefined, discovery && verify ? { config: discovery, verify } : undefined, phone) })
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
      unregisterPhone?.()
      phone?.close()
      unregister?.()
      await gateway?.close()
      await closeAdmin()
      throw error
    }
    return async () => {
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
