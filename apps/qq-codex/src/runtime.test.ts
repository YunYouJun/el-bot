import type { RemoteConfig } from './types'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runtimeStatus, stopBackground } from './control'
import { startRemote } from './runtime'

const fake = vi.hoisted(() => ({ start: vi.fn(async () => {}), close: vi.fn(async () => {}), gatewayStart: vi.fn(async () => {}), gatewayStop: vi.fn() }))
vi.mock('@el-bot/codex', async (original) => {
  const { EventEmitter } = await import('node:events')
  return { ...await original<typeof import('@el-bot/codex')>(), CodexClient: class extends EventEmitter { start = fake.start; close = fake.close } }
})
vi.mock('qq-sdk/official', async original => ({
  ...await original<typeof import('qq-sdk/official')>(),
  QQBotClient: class {},
  QQGateway: class { start = fake.gatewayStart; stop = fake.gatewayStop },
}))
vi.mock('./readiness', () => ({ checkCodexReadiness: async () => {} }))
vi.mock('./sessions', () => ({ inspectSessions: async () => [], sessionSummary: () => '' }))

const directories: string[] = []
afterEach(async () => {
  fake.start.mockReset().mockResolvedValue()
  fake.close.mockReset().mockResolvedValue()
  fake.gatewayStart.mockReset().mockResolvedValue()
  fake.gatewayStop.mockReset()
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'el-runtime-test-'))
  directories.push(directory)
  const state = join(directory, 'state.json')
  const config: RemoteConfig = { projects: { demo: directory }, defaultProject: 'demo', transport: 'websocket', webhookPort: 0, sandbox: true, messageFormat: 'markdown', ownerOpenId: 'test-owner' }
  return { state, config }
}

describe('runtime cleanup without real connections', () => {
  it('cancels unfinished startup, shares cleanup and never launches the QQ transport', async () => {
    let ready!: () => void
    fake.start.mockImplementationOnce(() => new Promise<void>((resolve) => {
      ready = resolve
    }))
    const { state, config } = await fixture()
    const starting = startRemote(config, state, { appId: 'test', secret: 'fake-secret' })
    await vi.waitFor(() => expect(fake.start).toHaveBeenCalledOnce())
    const first = stopBackground(state)
    await vi.waitFor(async () => expect((await runtimeStatus(state)).phase).toBe('stopping'))
    const second = stopBackground(state)
    // Allow the second authenticated request to reach the same lifecycle promise.
    await new Promise(resolve => setImmediate(resolve))
    ready()
    await Promise.all([starting, first, second])
    expect(fake.close).toHaveBeenCalledOnce()
    expect(fake.gatewayStart).not.toHaveBeenCalled()
    await expect(access(`${state}.lock`)).rejects.toThrow()
  })

  it('reports a cleanup failure after closing remaining resources and releasing the lock', async () => {
    const { state, config } = await fixture()
    await startRemote(config, state, { appId: 'test', secret: 'fake-secret' })
    fake.gatewayStop.mockImplementationOnce(() => {
      throw new Error('transport cleanup failed')
    })
    await expect(stopBackground(state)).rejects.toThrow('关闭步骤失败')
    expect(fake.close).toHaveBeenCalledOnce()
    expect((await runtimeStatus(state)).phase).toBe('stopped')
    await expect(access(`${state}.control.json`)).rejects.toThrow()
  })
})
