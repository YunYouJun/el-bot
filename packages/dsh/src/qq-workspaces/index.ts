import type { GroupingOptions, HostContext, QQManager, Route } from './contracts'
import type { ModelProjections, ModelSelection } from './model-selection'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installHooks, WorkspaceGrouping } from './grouping'
import { legacySelection, projectedModel } from './model-selection'

export const name = 'el-bot-qq-workspaces'
export const inject = ['workspaceRegistry', 'sessionPersistence']

interface Settings {
  appId: string
  profileDirectory?: string
  directory?: string
  originalDirectory?: string
  privateTitle?: string
  groupTitle?: string
}

/** A companion service; the original QQ entry keeps ownership of all credentials and UI. */
export async function apply(ctx: HostContext, settings: Settings): Promise<void> {
  const statusPath = join(homedir(), '.dsh-qqbot/workspace-grouping-status.json')
  const status = async (phase: string, error?: string) => {
    await mkdir(dirname(statusPath), { recursive: true, mode: 0o700 })
    await writeFile(statusPath, `${JSON.stringify({ phase, error, updatedAt: new Date().toISOString() })}\n`, { mode: 0o600 })
  }
  await status('loading')
  const profile = settings.profileDirectory ?? join(homedir(), '.dsh/profiles/desktop')
  const require = createRequire(join(profile, 'package.json'))
  const manifestPath = require.resolve('@tencent-connect/dsh-qqbot/package.json')
  const manifest: { version: string } = require(manifestPath)
  if (manifest.version !== '0.5.5')
    throw new Error(`QQ workspace adapter supports dsh-qqbot 0.5.5; installed version is ${manifest.version}`)
  const appId = settings.appId
  if (typeof appId !== 'string' || !/^\d+$/.test(appId))
    throw new Error('QQ workspace grouping requires the bound AppID')
  const base = settings.directory ?? join(homedir(), '.dsh-qqbot/workspaces', appId)
  const privateDirectory = join(base, 'private')
  const groupDirectory = join(base, 'groups')
  await mkdir(privateDirectory, { recursive: true, mode: 0o700 })
  await mkdir(groupDirectory, { recursive: true, mode: 0o700 })
  const options: GroupingOptions = {
    appId,
    prefsFile: join(homedir(), '.dsh-qqbot/model-prefs.json'),
    originalDirectory: settings.originalDirectory ?? join(homedir(), '.dsh-qqbot/workspace'),
    privateDirectory: await realpath(privateDirectory),
    groupDirectory: await realpath(groupDirectory),
    privateTitle: settings.privateTitle ?? 'QQ · 私聊',
    groupTitle: settings.groupTitle ?? 'QQ · 群聊',
  }
  const workspaces = {
    c2c: await ctx.workspaceRegistry.create(options.privateDirectory, options.privateTitle),
    group: await ctx.workspaceRegistry.create(options.groupDirectory, options.groupTitle),
  }
  await status('workspaces-created')
  const specifier = pathToFileURL(join(dirname(manifestPath), 'lib/session/session-manager.js')).href
  // The desktop loader has its own module realm. Import through the same loader
  // as the official entry so both plugins share exactly one SessionManager class.
  const loadModule = (path: string) => ctx.loader?.internal
    ? ctx.loader.internal.import(path, ctx.baseUrl ?? pathToFileURL(join(profile, 'cordis.yml')).href, {})
    : import(path)
  const namespace = await loadModule(specifier)
  const module = namespace as { SessionManager: { prototype: QQManager } }
  const grouping = new WorkspaceGrouping(ctx, options, workspaces)
  const legacySelections = new WeakMap<object, ModelSelection>()
  const projections = ctx.get?.('sessionProjections') as ModelProjections | undefined
  if (projections)
    grouping.readLegacy = record => projectedModel(projections, record)
  grouping.selectLegacy = async (record, route) => {
    let selection = legacySelections.get(record.agent)
    if (!selection) {
      if (!record.agent.ctx)
        throw new Error('The Web host does not expose an agent scope')
      const agentModule = await loadModule(pathToFileURL(require.resolve('@deepseek-ai/dsh-agent')).href) as {
        installModelSelection?: (scope: unknown, selection: { current: Route | undefined, assembled: Route | undefined }) => unknown
      }
      if (!agentModule.installModelSelection)
        throw new Error('The Web host does not support scoped model selection')
      if (!projections || !grouping.manager?.modelResolver)
        throw new Error('The Web host does not expose shared model selection and QQ preferences')
      const resolver = grouping.manager.modelResolver
      const shared = legacySelection(projections, record, route, selected => resolver.setOverride(record.sessionKey, selected))
      selection = shared.selection
      const dispose = agentModule.installModelSelection(record.agent.ctx, selection)
      const agentContext = record.agent.ctx as Pick<HostContext, 'effect'>
      agentContext.effect(() => () => {
        shared.dispose()
        if (typeof dispose === 'function')
          dispose()
      }, 'el-bot.qq-model-selection')
      legacySelections.set(record.agent, selection)
    }
    selection.current = route
  }
  grouping.onCaptured = () => {
    // Constructor capture is synchronous; migration starts after QQ bootstrap has returned.
    queueMicrotask(() => {
      void grouping.migrateExisting().then(() => status('ready')).catch(async (error: unknown) => {
        const message = error instanceof Error ? error.message : 'Migration failed'
        ctx.logger?.warn(`QQ workspace migration: ${message}`)
        await status('migration-failed', message)
      })
    })
  }
  const dispose = installHooks(module.SessionManager.prototype, grouping, true)
  ctx.effect(() => dispose, 'el-bot.qq-workspaces')
  if (!ctx.provide)
    throw new Error('The DSH host does not support companion services')
  ctx.provide('qqWorkspaceGrouping', grouping)
  await status('waiting-for-qq')
}
