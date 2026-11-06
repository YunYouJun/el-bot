import type { MobileContext, MobileSettings } from './types'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { adminSocket } from './admin'
import { DeviceStore } from './auth'
import { DshMobileHost } from './host'
import { API_PATH, mobileRoutes } from './http'

export const name = 'el-bot-mobile'
export const inject = ['webServer', 'sessionController', 'workspaceRegistry']

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
    const host = new DshMobileHost(ctx.sessionController, ctx.workspaceRegistry, settings, helpers.joinAssistantStreamText)
    const closeAdmin = await adminSocket(join(directory, 'admin.sock'), devices)
    let unregister: () => void
    try {
      unregister = ctx.webServer.register({ kind: 'prefix', path: API_PATH, handler: mobileRoutes(host, devices, origin.origin, (error) => {
        const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[\w/-]+$/.test(error.code) ? error.code : 'unknown'
        // Names and codes identify integration failures without logging prompts or credentials.
        console.error('Mobile request failed', error instanceof Error ? error.name : 'Error', code)
      }) })
    }
    catch (error) {
      await closeAdmin()
      throw error
    }
    return async () => {
      unregister()
      await closeAdmin()
    }
  })
}
