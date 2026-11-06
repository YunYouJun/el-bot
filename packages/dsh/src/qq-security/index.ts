import type { Gateway, SecurityContext, SecuritySettings } from './contracts'
import { existsSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { profileDirectory } from '../service'
import { protectGateway } from './gateway'
import { manualRoutes } from './manual-http'
import { manualRuntime } from './manual-runtime'
import { QQConversationMetadataStore } from './metadata'
import { QQSecurity } from './policy'
import { SecurityStore } from './store'

export { protectGateway } from './gateway'
export { ManualControl } from './manual'
export { manualRoutes } from './manual-http'
export { manualRuntime } from './manual-runtime'
export { GROUP_CHAT_PROMPT, MAX_OUTPUT_TOKENS, QQSecurity } from './policy'
export { SecurityStore } from './store'
export const name = 'el-bot-qq-security'
export const inject = ['qqWorkspaceGrouping', 'tools', 'loader', 'webServer', 'connection', 'sessionController']

export async function apply(ctx: SecurityContext, settings: SecuritySettings) {
  const profile = profileDirectory(settings.profileDirectory)
  const require = createRequire(join(profile, 'package.json'))
  if (require(require.resolve('@deepseek-ai/dsh/package.json')).version !== '0.2.1-rc.5')
    throw new Error('QQ security requires DSH 0.2.1-rc.5')
  const manifest = require.resolve('@tencent-connect/dsh-qqbot/package.json')
  if (require(manifest).version !== '0.5.5')
    throw new Error('QQ security requires dsh-qqbot 0.5.5')
  const pluginRequire = createRequire(manifest)
  // The SDK exports only its ESM entry, not package.json or a require condition.
  const sdkCandidate = (pluginRequire.resolve.paths('@tencent-connect/qqbot-nodejs') ?? [])
    .map(root => join(root, '@tencent-connect/qqbot-nodejs/package.json'))
    .find(path => existsSync(path))
  if (!sdkCandidate)
    throw new Error('The official QQ SDK is not installed')
  const sdkManifest = realpathSync(sdkCandidate)
  if (require(sdkManifest).version !== '1.0.5')
    throw new Error('QQ security requires qqbot-nodejs 1.0.5')
  if (typeof ctx.tools.guard !== 'function')
    throw new Error('The DSH host cannot enforce monotonic tool guards')
  const groupDirectory = join(homedir(), '.dsh-qqbot/workspaces', settings.appId, 'groups')
  const policy = new QQSecurity(settings, new SecurityStore(join(profile, 'el-bot-security/state.json')), groupDirectory)
  const metadata = new QQConversationMetadataStore(settings.appId, join(profile, 'el-bot-security/conversations.json'), join(homedir(), '.dsh-qqbot/model-prefs.json'), (scope, peer) => policy.allowed(scope, peer))
  await metadata.load()
  policy.observeMetadata = message => metadata.observe(message)
  ctx.provide('qqConversationMetadata', metadata)
  ctx.effect(() => () => {
    void metadata.close()
  }, 'el-bot.qq-conversation-metadata')
  const manual = manualRuntime(ctx, policy, profile)
  await manual.controller.initialize()
  ctx.effect(() => manualRoutes(ctx, manual.controller), 'el-bot.qq-manual-http')
  ctx.effect(() => () => manual.controller.close(), 'el-bot.qq-manual-control')
  // Resolve through the same Loader realm as the official entry and cloud health adapter.
  const entry = pathToFileURL(join(dirname(sdkManifest), 'dist/index.js')).href
  const loaded = await (ctx.loader?.internal
    ? ctx.loader.internal.import(entry, ctx.baseUrl ?? pathToFileURL(join(profile, 'cordis.yml')).href, {})
    : import(entry)) as { QQBot: { prototype: Gateway } }
  const restore = protectGateway(loaded.QQBot.prototype, policy, (bot) => {
    if (bot.api) {
      const api = bot.api
      metadata.bind(async path => bot.apiClient && api.getToken
        ? bot.apiClient.request(await api.getToken(), 'GET', path, undefined, { timeoutMs: 4000 })
        : api.get(path))
    }
    const directory = join(profile, 'el-bot-security')
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const path = join(directory, 'runtime.json')
    writeFileSync(`${path}.tmp`, `${JSON.stringify({
      mode: 'chat-only',
      allowedGroups: policy.groups.size,
      ownerPinned: true,
      manualEnabled: true,
      middlewareInstalled: true,
      toolGuardInstalled: true,
      pid: process.pid,
      updatedAt: Date.now(),
    })}\n`, { mode: 0o600 })
    renameSync(`${path}.tmp`, path)
  }, manual.hooks)
  ctx.effect(() => restore, 'el-bot.qq-security-gateway')
  const unguard = ctx.tools.guard(policy.guard)
  ctx.effect(() => unguard, 'el-bot.qq-security-tools')
  let detach: (() => void) | undefined
  const stop = ctx.qqWorkspaceGrouping.watchManager((manager) => {
    detach = policy.attach(manager)
  })
  ctx.effect(() => () => {
    stop()
    detach?.()
  }, 'el-bot.qq-security-admission')
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => policy.prompt(context.agent, await next()), { prepend: true })
  ctx.on('agent/pre-step', async (payload, next) => policy.preStep(payload) ?? await next(), { global: true, prepend: true })
  ctx.on('agent/request', async (payload, next) => policy.request(payload, await next()), { global: true, prepend: true })
  ctx.provide('qqRuntimeSecurity', { mode: 'chat-only', allowedGroups: policy.groups.size })
}
