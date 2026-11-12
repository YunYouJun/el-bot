import { expect, it, vi } from 'vitest'
import { QQDeployment } from './deployment'

it('defers an upgrade without freezing an active turn', async () => {
  const list = vi.fn(async () => ({ items: [{ sessionId: 'active', running: true }] }))
  const gate = new QQDeployment({ list }, () => false, () => false)
  expect(await gate.command('prepare')).toEqual({ state: 'busy' })
  expect(gate.paused).toBe(false)
  expect(gate.frozen).toBe(false)
})

it('checks again after the session query, and freezes new work only after an idle result', async () => {
  let active = false
  let now = 10
  let unblock!: () => void
  const list = vi.fn(async () => {
    await new Promise<void>(resolve => unblock = resolve)
    return { items: [] }
  })
  const gate = new QQDeployment({ list }, () => active, () => false, () => now)
  const first = gate.command('prepare')
  expect(gate.paused).toBe(true)
  expect(gate.frozen).toBe(false)
  active = true
  unblock()
  expect(await first).toEqual({ state: 'busy' })
  active = false
  const second = gate.command('prepare')
  unblock()
  expect(await second).toEqual({ state: 'prepared' })
  expect(gate.frozen).toBe(true)
  const inbound = vi.fn(async () => {})
  const rejected = vi.fn()
  await gate.admit(inbound, rejected)
  expect(inbound).not.toHaveBeenCalled()
  expect(rejected).toHaveBeenCalledOnce()
  now += 90_001
  expect(gate.paused).toBe(false)
})

it('leaves admission open when the task check cannot prove idleness', async () => {
  const gate = new QQDeployment({ list: async () => ({ total: 101, items: [] }) }, () => false, () => false)
  expect(await gate.command('prepare')).toEqual({ state: 'unavailable' })
  expect(gate.paused).toBe(false)
})

it('defers while a detached session job is still stopping', async () => {
  const sessions = { list: async () => ({ items: [{ sessionId: 'owner', running: false }] }) }
  const jobs = { list: (owner?: string) => owner === 'owner' ? [{ status: 'stopping' }] : [] }
  const gate = new QQDeployment(sessions, () => false, () => false, Date.now, () => jobs)
  expect(await gate.command('prepare')).toEqual({ state: 'busy' })
  expect(gate.paused).toBe(false)
})
