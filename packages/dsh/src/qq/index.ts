import type { Gateway, QQContext, QQSettings } from './contracts'
import { existsSync, mkdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { DOWNSTREAM_COMMANDS, registerBuiltinQQCommands } from '../qq-commands/builtins'
import { QQCommandRegistry } from '../qq-commands/registry'
import { QQCommandRouter } from '../qq-commands/router'
import { profileDirectory } from '../service'
import { protectGateway } from './gateway'
import { QQGroupDirectory } from './groups'
import { QQMemberImpressionTool } from './impression-tool'
import { QQMemberImpressions } from './impressions'
import { manualRoutes } from './manual-http'
import { manualRuntime } from './manual-runtime'
import { QQConversationMetadataStore } from './metadata'
import { NativeQQChat } from './native-chat'
import { QQPolicy } from './policy'
import { ScheduleControl } from './schedule'
import { ownerScheduleResolver } from './schedule-activation'
import { scheduleRoutes } from './schedule-http'
import { ScheduleError } from './schedule-types'
import { QQStateStore } from './store'
import { QQTranscript } from './transcript'

export * from '../qq-commands'
export type { QQContext, QQEvents, QQManager, QQSettings } from './contracts'
export { protectGateway } from './gateway'
export { QQMemberImpressions } from './impressions'
export { ManualControl } from './manual'
export { manualRoutes } from './manual-http'
export { manualRuntime } from './manual-runtime'
export { GROUP_CHAT_PROMPT, MAX_OUTPUT_TOKENS, QQPolicy } from './policy'
export { ScheduleControl } from './schedule'
export { ownerScheduleResolver } from './schedule-activation'
export { scheduleRoutes } from './schedule-http'
export { QQStateStore } from './store'
export { QQTranscript } from './transcript'
export const name = 'el-bot-qq'
export const inject = ['qqWorkspaceGrouping', 'tools', 'loader', 'webServer', 'connection', 'sessionController', 'llm']

export async function apply(ctx: QQContext, settings: QQSettings) {
  const profile = profileDirectory(settings.profileDirectory)
  const directory = join(profile, 'el-bot-qq')
  const require = createRequire(join(profile, 'package.json'))
  if (!['0.2.1-rc.5', '0.2.2-rc.1'].includes(require(require.resolve('@deepseek-ai/dsh/package.json')).version))
    throw new Error('QQ integration requires DSH 0.2.1-rc.5 or 0.2.2-rc.1')
  const manifest = require.resolve('@tencent-connect/dsh-qqbot/package.json')
  if (require(manifest).version !== '0.5.5')
    throw new Error('QQ integration requires dsh-qqbot 0.5.5')
  const pluginRequire = createRequire(manifest)
  // The SDK exports only its ESM entry, not package.json or a require condition.
  const sdkCandidate = (pluginRequire.resolve.paths('@tencent-connect/qqbot-nodejs') ?? [])
    .map(root => join(root, '@tencent-connect/qqbot-nodejs/package.json'))
    .find(path => existsSync(path))
  if (!sdkCandidate)
    throw new Error('The official QQ SDK is not installed')
  const sdkManifest = realpathSync(sdkCandidate)
  if (require(sdkManifest).version !== '1.0.5')
    throw new Error('QQ integration requires qqbot-nodejs 1.0.5')
  if (typeof ctx.tools.guard !== 'function')
    throw new Error('The DSH host cannot enforce monotonic tool guards')
  const groupDirectory = join(homedir(), '.dsh-qqbot/workspaces', settings.appId, 'groups')
  const policy = new QQPolicy(settings, new QQStateStore(join(directory, 'state.json')), groupDirectory)
  const commands = new QQCommandRegistry({ catalog: DOWNSTREAM_COMMANDS })
  let restarting = false
  const builtinCommandDisposers = registerBuiltinQQCommands(commands, {
    restart: async (force, reply) => {
      const exit = ctx.get('appExit')
      const supervised = process.env.DSH_RESTART_SUPERVISED === '1' || existsSync('/.dockerenv')
      if (typeof exit !== 'function' || !supervised) {
        await reply('当前运行方式不支持自重启，请在服务器执行 docker compose restart el-bot-dsh。')
        return
      }
      if (restarting) {
        await reply('已经在重启中，请稍候。')
        return
      }
      let running = 0
      try {
        const { items } = await ctx.sessionController.list({}, AbortSignal.timeout(5000))
        running = items.filter(item => item.running === true).length
      }
      catch {
        await reply('无法确认运行中的任务，重启已取消。请稍后重试。')
        return
      }
      if (running > 0 && !force) {
        await reply(`当前还有 ${running} 个任务在运行。发送 /restart force 确认中断并重启。`)
        return
      }
      restarting = true
      await reply(running > 0
        ? `正在中断 ${running} 个任务并重启，约 10–30 秒后恢复。`
        : '正在重启，约 10–30 秒后恢复。')
      setTimeout(exit as (code: number) => void, 750, 0)
    },
  })
  ctx.effect(() => () => {
    for (const dispose of builtinCommandDisposers)
      dispose()
  }, 'el-bot.qq-commands')
  ctx.provide('qqCommands', commands)
  const commandRouter = new QQCommandRouter(commands, {
    owner: policy.owner,
    isPaused: () => policy.paused('c2c', policy.owner),
    onError: (command, error) => ctx.logger?.error?.(`QQ command /${command} failed: ${error instanceof Error ? error.message : 'unknown error'}`),
    markdown: settings.commandMarkdown !== false,
  })
  policy.command = ctx => commandRouter.handle(ctx)
  const metadata = new QQConversationMetadataStore(settings.appId, join(directory, 'conversations.json'), join(homedir(), '.dsh-qqbot/model-prefs.json'), (scope, peer) => policy.allowed(scope, peer))
  await metadata.load()
  const groups = new QQGroupDirectory(settings.appId, join(directory, 'groups.json'), join(homedir(), '.dsh-qqbot/model-prefs.json'), policy, metadata)
  await groups.load()
  policy.observeGroup = message => groups.observe(message)
  groups.isArchived = id => (ctx.get('workspaceRegistry') as { archivedSessionIds: readonly string[] } | undefined)?.archivedSessionIds.includes(id) ?? false
  policy.beforeSession = (scope, peer) => groups.beforeOpen(scope, peer)
  ctx.provide('qqGroupDirectory', groups)
  const loadModule = (path: string) => ctx.loader?.internal
    ? ctx.loader.internal.import(path, ctx.baseUrl ?? pathToFileURL(join(profile, 'cordis.yml')).href, {})
    : import(path)
  const history = await loadModule(pathToFileURL(join(dirname(manifest), 'lib/features/history-store.js')).href) as {
    getHistoryStore: () => { clear: (key: string) => void }
    historyGroupKey: (appId: string, groupId: string) => string
  }
  groups.clearHistory = peer => history.getHistoryStore().clear(history.historyGroupKey(settings.appId, peer))
  ctx.effect(() => () => groups.close(), 'el-bot.qq-group-directory')
  policy.observeMetadata = message => metadata.observe(message)
  ctx.provide('qqConversationMetadata', metadata)
  ctx.effect(() => () => metadata.close(), 'el-bot.qq-conversation-metadata')
  const transcript = new QQTranscript(join(directory, 'qq-transcript'), peer => policy.allowed('group', peer))
  await transcript.load()
  transcript.isArchived = id => groups.isArchived?.(id) ?? false
  const impressions = new QQMemberImpressions(join(directory, 'member-impressions.json'))
  await impressions.load()
  ctx.effect(() => () => impressions.close(), 'el-bot.qq-member-impressions')
  policy.captureInbound = message => transcript.inbound(message)
  policy.afterSession = (record, anchor) => record.scope === 'group' ? transcript.bind(record.peerId, record.sessionId, anchor) : Promise.resolve()
  const manual = manualRuntime(ctx, policy, profile, undefined, async (target, text, handoff, send) => {
    const peer = target.targetId
    const current = await groups.currentSession(peer)
    if (current)
      await transcript.bind(peer, current)
    return transcript.send(peer, text, handoff, send)
  })
  ctx.provide('qqNativeChat', new NativeQQChat(transcript, manual.controller, groups, policy, impressions))
  const impressionTool = new QQMemberImpressionTool(impressions, transcript, groups, policy)
  ctx.effect(() => impressionTool.register(ctx.tools), 'el-bot.qq-member-impression-tool')
  ctx.effect(() => () => transcript.close(), 'el-bot.qq-transcript')
  await manual.controller.initialize()
  ctx.effect(() => manualRoutes(ctx, manual.controller), 'el-bot.qq-manual-http')
  ctx.effect(() => () => manual.controller.close(), 'el-bot.qq-manual-control')
  const timezone = settings.timezone ?? 'Asia/Shanghai'
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    formatter.format(0)
  }
  catch {
    throw new Error('QQ scheduled messages require a valid IANA timezone')
  }
  const schedule = new ScheduleControl(join(directory, 'scheduled.json'), {
    online: () => manual.controller.online,
    targets: () => manual.controller.targets(),
    model: (target) => {
      const route = policy.effectiveModel('group', target.peerId)
      if (route?.provider && route.model)
        return route
      if (settings.summary?.provider && settings.summary.model) {
        return {
          provider: settings.summary.provider,
          model: settings.summary.model,
          ...(settings.summary.reasoningEffort ? { reasoningEffort: settings.summary.reasoningEffort } : {}),
        }
      }
    },
    recent: (target, since, until, maxMessages) => transcript.recent(target.peerId, since, until, maxMessages),
    send: async (target, text) => {
      if (!await policy.manualQuota('group', target.peerId)) {
        throw new ScheduleError(429, 'rate_limited')
      }
      await transcript.bind(target.peerId, target.sessionId)
      const response = await manual.sendProactive({ scope: 'group', targetId: target.peerId }, text)
      return typeof response === 'object' && response ? response as { id?: string } : {}
    },
  }, {
    timezone,
    llm: ctx.llm,
    ...(settings.summary?.maxTokens ? { summaryMaxTokens: settings.summary.maxTokens } : {}),
    ...(settings.summary?.timeoutMs ? { summaryTimeoutMs: settings.summary.timeoutMs } : {}),
  })
  await schedule.initialize()
  ctx.effect(() => scheduleRoutes(ctx, schedule), 'el-bot.qq-schedule-http')
  ctx.effect(() => () => schedule.close(), 'el-bot.qq-schedule-control')
  // Resolve through the same Loader realm as the official entry and cloud health adapter.
  const entry = pathToFileURL(join(dirname(sdkManifest), 'dist/index.js')).href
  const loaded = await (ctx.loader?.internal
    ? ctx.loader.internal.import(entry, ctx.baseUrl ?? pathToFileURL(join(profile, 'cordis.yml')).href, {})
    : import(entry)) as { QQBot: { prototype: Gateway } }
  const rawListeners: (() => void)[] = []
  const bound = new WeakSet<Gateway>()
  const restore = protectGateway(loaded.QQBot.prototype, policy, (bot) => {
    if (!bound.has(bot)) {
      bound.add(bot)
      const listener: import('./contracts').InteractionHandler = (context) => {
        const event = context as { eventType?: string, data?: unknown }
        if (event.eventType)
          groups.event(event.eventType, event.data)
      }
      bot.on('rawEvent', listener)
      rawListeners.push(() => {
        bot.off('rawEvent', listener)
      })
    }
    if (bot.api) {
      const api = bot.api
      metadata.bind(async path => bot.apiClient && api.getToken
        ? bot.apiClient.request(await api.getToken(), 'GET', path, undefined, { timeoutMs: 4000 })
        : api.get(path))
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const path = join(directory, 'runtime.json')
    writeFileSync(`${path}.tmp`, `${JSON.stringify({
      mode: 'chat-only',
      groupMode: 'open',
      ownerPinned: true,
      manualEnabled: true,
      scheduledEnabled: true,
      ownerRemindersEnabled: true,
      commandsEnabled: true,
      commandMarkdown: settings.commandMarkdown !== false,
      commandCount: commands.all().length + DOWNSTREAM_COMMANDS.length,
      middlewareInstalled: true,
      toolGuardInstalled: true,
      pid: process.pid,
      updatedAt: Date.now(),
    })}\n`, { mode: 0o600 })
    renameSync(`${path}.tmp`, path)
  }, manual.hooks)
  ctx.effect(() => () => {
    for (const remove of rawListeners) remove()
    restore()
  }, 'el-bot.qq-gateway')
  const unguard = ctx.tools.guard(policy.guard)
  ctx.effect(() => unguard, 'el-bot.qq-tools')
  let detach: (() => void) | undefined
  let qqManager: import('./contracts').QQManager | undefined
  const stop = ctx.qqWorkspaceGrouping.watchManager((manager) => {
    qqManager = manager
    groups.manager = manager
    detach = policy.attach(manager)
  })
  ctx.effect(() => () => {
    qqManager = undefined
    stop()
    detach?.()
  }, 'el-bot.qq-admission')
  ctx.on('schedule/resolve-agent', ownerScheduleResolver(() => qqManager, policy))
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => policy.prompt(context.agent, await next()), { prepend: true })
  ctx.on('agent/pre-step', async (payload, next) => policy.preStep(payload) ?? await next(), { global: true, prepend: true })
  ctx.on('agent/request', async (payload, next) => policy.request(payload, await next()), { global: true, prepend: true })
  ctx.provide('qqRuntime', { mode: 'chat-only', groupMode: 'open' })
}
