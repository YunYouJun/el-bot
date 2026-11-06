import type { Gateway, SecurityContext, Target } from './contracts'
import type { ManualTarget } from './manual-types'
import type { QQSecurity } from './policy'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parsePeer } from '../qq-workspaces/grouping'
import { ManualControl } from './manual'
import { ManualError } from './manual-types'

/** A private capability connects owner-confirmed sends to the existing live SDK. */
export function manualRuntime(ctx: SecurityContext, policy: QQSecurity, profile: string, preferencesFile = join(homedir(), '.dsh-qqbot/model-prefs.json')) {
  const capability = new AsyncLocalStorage<string>()
  const pending = new Map<string, Set<Promise<unknown>>>()
  const streams = new Map<string, Set<{ cancel: () => void }>>()
  let transport: ((target: Target, text: string) => Promise<unknown>) | undefined
  const id = (target: Target) => policy.targetId(target.scope, target.targetId)
  const controller: ManualControl = new ManualControl(join(profile, 'el-bot-security/manual.json'), {
    targets: async () => {
      let preferences: { sessionIds?: Record<string, unknown> }
      try {
        preferences = JSON.parse(await readFile(preferencesFile, 'utf8'))
      }
      catch { throw new ManualError(503, 'unavailable') }
      const { items } = await ctx.sessionController.list({}, AbortSignal.timeout(5000))
      return Object.entries(preferences.sessionIds ?? {}).flatMap(([key, sessionId]): ManualTarget[] => {
        const peer = parsePeer(key, policy.appId)
        if (!peer || !policy.allowed(peer.scope, peer.peerId) || typeof sessionId !== 'string' || !sessionId)
          return []
        const values = items.find(row => row.sessionId === sessionId)?.projections?.values
        const projected = values?.title
        const detail = projected && typeof projected === 'object' ? projected as Record<string, unknown> : {}
        const title = [projected, detail.title, detail.value, detail.manual, detail.generated].find(value => typeof value === 'string' && value.trim())
        const handle = policy.targetId(peer.scope, peer.peerId)
        return [{ id: handle, ...peer, sessionId, title: typeof title === 'string' ? title.slice(0, 160) : peer.scope === 'c2c' ? '主人私聊' : `QQ 群 · ${handle.slice(0, 8)}` }]
      })
    },
    drain: async (target) => {
      for (const stream of streams.get(target.id) ?? [])
        stream.cancel()
      streams.delete(target.id)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          (async () => {
            await policy.drain(target.scope, target.peerId)
            await Promise.allSettled([...(pending.get(target.id) ?? [])])
          })(),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('drain timeout')), 10_000) }),
        ])
      }
      finally { clearTimeout(timer) }
    },
    quota: target => policy.manualQuota(target.scope, target.peerId),
    reserveReply: (target, msgId) => policy.manualReply(target.scope, target.peerId, msgId),
    send: async (target, text, _mode, msgId) => {
      if (!transport || !policy.allowed(target.scope, target.peerId) || !controller.paused(target.id))
        throw new ManualError(503, 'unavailable')
      return capability.run(target.id, () => transport!({ scope: target.scope, targetId: target.peerId, msgId }, text))
    },
  })
  policy.manual = controller

  const hooks = {
    offline() {
      controller.online = false
      transport = undefined
      for (const entries of streams.values()) {
        for (const stream of entries)
          stream.cancel()
      }
      streams.clear()
    },
    bind(bot: Gateway, exact: (target: Target, text: string) => unknown) {
      const api = bot.messageApi
      if (!api || typeof bot.openStream !== 'function')
        throw new Error('The QQ SDK lacks manual handoff boundaries')
      transport = (target, text) => Promise.resolve(exact(target, text))
      for (const name of ['sendRaw', 'sendMessage', 'sendProactiveMessage', 'sendC2CStreamMessage']) {
        const original = api[name]
        if (typeof original !== 'function')
          throw new Error('The QQ SDK lacks a guarded sending boundary')
        api[name] = (...args: unknown[]) => {
          const stream = name === 'sendC2CStreamMessage'
          const body = (stream ? args[2] : name === 'sendRaw' ? args[3] : args[4]) as { msg_id?: string, msgId?: string, event_id?: string } | undefined
          const target: Target = {
            scope: stream ? 'c2c' : String(args[0]),
            targetId: String(args[1]),
            msgId: body?.msg_id ?? body?.msgId,
            eventId: body?.event_id,
          }
          if (capability.getStore() !== id(target))
            policy.assertAutomatic(target)
          const task = Promise.resolve().then(() => original.apply(api, args))
          const entries = pending.get(id(target)) ?? new Set<Promise<unknown>>()
          entries.add(task)
          pending.set(id(target), entries)
          return task.finally(() => {
            entries.delete(task)
            if (!entries.size)
              pending.delete(id(target))
          })
        }
      }
      bot.on('ready', () => {
        controller.online = true
      })
      bot.on('resumed', () => {
        controller.online = true
      })
      bot.on('disconnected', () => {
        controller.online = false
      })
    },
    stream(target: Target, stream: { cancel: () => void }) {
      policy.assertAutomatic(target)
      const entries = streams.get(id(target)) ?? new Set<{ cancel: () => void }>()
      entries.add(stream)
      streams.set(id(target), entries)
      const cancel = stream.cancel.bind(stream)
      stream.cancel = () => {
        entries.delete(stream)
        cancel()
      }
      const completed = stream as { complete?: () => Promise<unknown> }
      if (completed.complete) {
        const complete = completed.complete.bind(stream)
        completed.complete = () => complete().finally(() => entries.delete(stream))
      }
    },
  }
  return { controller, hooks }
}
