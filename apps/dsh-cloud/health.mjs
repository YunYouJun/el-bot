import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { persistHistory } from './history.mjs'

export const name = 'el-bot-cloud-health'
export const inject = ['qqWorkspaceGrouping']

export function runtimeReady(boot, transport, grouping) {
  return Boolean(boot?.id && transport?.bootId === boot.id
    && transport.connected === true && grouping?.phase === 'ready')
}

export function monitorBot(prototype, appId, publish) {
  const start = prototype.start
  const stop = prototype.stop
  const listeners = new Map()
  prototype.start = function (...args) {
    if (this.appId !== appId)
      return start.apply(this, args)
    if (!listeners.has(this)) {
      const handlers = {
        ready: () => publish({ connected: true, phase: 'ready' }),
        resumed: () => publish({ connected: true, phase: 'resumed' }),
        disconnected: event => publish({ connected: false, phase: 'disconnected', code: event.code }),
      }
      for (const [event, handler] of Object.entries(handlers))
        this.on(event, handler)
      listeners.set(this, handlers)
    }
    publish({ connected: false, phase: 'connecting' })
    const result = start.apply(this, args)
    Promise.resolve(result).catch(() => publish({ connected: false, phase: 'failed' }))
    return result
  }
  prototype.stop = function (...args) {
    if (this.appId === appId)
      publish({ connected: false, phase: 'stopped' })
    return stop.apply(this, args)
  }
  return () => {
    prototype.start = start
    prototype.stop = stop
    for (const [bot, handlers] of listeners) {
      for (const [event, handler] of Object.entries(handlers))
        bot.off(event, handler)
    }
    listeners.clear()
  }
}

export async function apply(ctx, { appId }) {
  const directory = join(homedir(), '.dsh-qqbot')
  const boot = JSON.parse(readFileSync(join(directory, 'cloud-boot.json'), 'utf8'))
  const path = join(directory, 'cloud-runtime-status.json')
  const publish = (state) => {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    writeFileSync(`${path}.tmp`, `${JSON.stringify({ ...state, appId, bootId: boot.id, pid: process.pid, updatedAt: new Date().toISOString() })}\n`, { mode: 0o600 })
    renameSync(`${path}.tmp`, path)
  }
  publish({ connected: false, phase: 'loading' })
  const profile = join(homedir(), '.dsh/profiles/cloud')
  const load = specifier => ctx.loader?.internal
    ? ctx.loader.internal.import(specifier, pathToFileURL(join(profile, 'cordis.yml')).href, {})
    : import(specifier)
  const require = createRequire(join(profile, 'package.json'))
  const plugin = dirname(require.resolve('@tencent-connect/dsh-qqbot/package.json'))
  if (require(join(plugin, 'package.json')).version !== '0.5.5')
    throw new Error('Cloud history adapter requires dsh-qqbot 0.5.5')
  const history = await load(pathToFileURL(join(plugin, 'lib/features/history-store.js')).href)
  const restoreHistory = persistHistory(history.getHistoryStore(), appId, join(directory, 'group-history', appId))
  ctx.effect(() => restoreHistory, 'el-bot.cloud-history')
  const namespace = await load('@tencent-connect/qqbot-nodejs')
  const dispose = monitorBot(namespace.QQBot.prototype, appId, publish)
  ctx.effect(() => dispose, 'el-bot.cloud-health')
  ctx.provide('qqRuntimeHealth', {})
}
