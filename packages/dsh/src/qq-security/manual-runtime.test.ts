import type { Gateway, SecurityContext, Target } from './contracts'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { manualRuntime } from './manual-runtime'
import { QQSecurity } from './policy'
import { SecurityStore } from './store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'qq-manual-runtime-'))
  directories.push(directory)
  const policy = new QQSecurity({ appId: '123', ownerOpenId: 'owner' }, new SecurityStore(join(directory, 'state.json')), join(directory, 'groups'))
  const preferences = join(directory, 'prefs.json')
  await writeFile(preferences, JSON.stringify({ sessionIds: { 'qqbot:123:group:group-a': 'session-a' } }))
  const captured = vi.fn()
  const captureSend = <T>(_target: Target, _text: string, _manual: boolean, send: () => Promise<T>) => {
    captured(_target, _text, _manual)
    return send()
  }
  const runtime = manualRuntime({
    sessionController: { list: async () => ({ items: [{ sessionId: 'session-a', projections: { values: { title: '测试群' } } }] }) },
  } as unknown as SecurityContext, policy, directory, preferences, captureSend)
  await runtime.controller.initialize()
  runtime.controller.online = true
  const sendMessage = vi.fn(async (_scope: string, _targetId: string, _text: string) => ({ id: 'qq-1' }))
  const api = {
    sendRaw: vi.fn(async () => ({ id: 'qq-raw' })),
    sendMessage,
    sendProactiveMessage: vi.fn(async () => ({ id: 'qq-proactive' })),
    sendC2CStreamMessage: vi.fn(async () => ({ id: 'qq-stream' })),
  }
  const bot = {
    appId: '123',
    messageApi: api,
    openStream: vi.fn(() => ({ cancel: vi.fn() })),
    on: vi.fn(),
  } as unknown as Gateway
  runtime.hooks.bind(bot, (target, text) => api.sendMessage(target.scope, target.targetId, text))
  return { directory, policy, runtime, api, sendMessage, captured }
}

it('lets a scheduled proactive send use the owner transport without a message id', async () => {
  const f = await fixture()
  const target = { scope: 'group' as const, targetId: 'group-a', msgId: 'incoming' }
  const response = await f.runtime.sendProactive(target, '定时总结')
  expect(response).toEqual({ id: 'qq-1' })
  expect(f.sendMessage).toHaveBeenCalledWith('group', 'group-a', '定时总结')
  expect(f.captured).toHaveBeenCalledOnce()
  expect(f.captured.mock.calls[0]![2]).toBe(false)
  f.runtime.controller.close()
})

it('blocks scheduled proactive sends during an owner handoff but not after the lease expires', async () => {
  const f = await fixture()
  const target = f.policy.targetId('group', 'group-a')
  const beginning = await f.runtime.controller.request({ operation: 'begin', target, seconds: 60 }) as { sessions: { lease?: { id: string } }[] }
  await expect(f.runtime.sendProactive({ scope: 'group', targetId: 'group-a' }, '暂停中')).rejects.toMatchObject({ code: 'manual_active' })
  expect(f.sendMessage).not.toHaveBeenCalled()

  const lease = beginning.sessions[0]!.lease!
  await f.runtime.controller.request({ operation: 'end', target, lease: lease.id })
  await f.runtime.sendProactive({ scope: 'group', targetId: 'group-a' }, '接管后')
  expect(f.sendMessage).toHaveBeenCalledOnce()
  expect(f.captured.mock.calls[0]![2]).toBe(false)
  f.runtime.controller.close()
})
