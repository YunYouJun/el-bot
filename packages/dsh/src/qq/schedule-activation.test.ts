import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ownerScheduleResolver } from './schedule-activation'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'qq-schedule-activation-'))
  directories.push(directory)
  const preferences = join(directory, 'prefs.json')
  await writeFile(preferences, JSON.stringify({ sessionIds: {
    'qqbot:123:c2c:owner': 'owner-session',
    'qqbot:123:c2c:stranger': 'stranger-session',
    'qqbot:123:group:group': 'group-session',
  } }))
  const agent = { status: 'idle', session: { header: { id: 'owner-session' } }, whenIdle: async () => {} }
  const getOrCreate = vi.fn(async () => ({ sessionKey: 'qqbot:123:c2c:owner', sessionId: 'owner-session', scope: 'c2c' as const, peerId: 'owner', agent }))
  const paused = vi.fn(() => false)
  const next = vi.fn(async () => ({ hostOnly: true }))
  const resolve = ownerScheduleResolver(() => ({ getOrCreate }), { appId: '123', owner: 'owner', paused }, preferences)
  return { preferences, resolve, getOrCreate, next, agent, paused }
}

it('restores an evicted owner binding through QQ admission before native delivery', async () => {
  const { resolve, getOrCreate, next, agent } = await fixture()
  expect(await resolve('owner-session', next)).toBe(agent)
  expect(getOrCreate).toHaveBeenCalledWith('c2c', 'owner', 'owner', { scope: 'c2c', targetId: 'owner', msgId: '' })
  expect(next).not.toHaveBeenCalled()
})

it('delegates other sessions without granting a QQ sending capability', async () => {
  const { resolve, getOrCreate, next } = await fixture()
  for (const id of ['web-session', 'old-owner-session', 'stranger-session', 'group-session'])
    expect(await resolve(id, next)).toEqual({ hostOnly: true })
  expect(getOrCreate).not.toHaveBeenCalled()
})

it('fails closed during handoff, without a manager, or if admission changes the target', async () => {
  const { resolve, getOrCreate, next, paused, preferences } = await fixture()
  paused.mockReturnValue(true)
  await expect(resolve('owner-session', next)).rejects.toThrow('manual control')
  expect(getOrCreate).not.toHaveBeenCalled()
  paused.mockReturnValue(false)
  const offline = ownerScheduleResolver(() => undefined, { appId: '123', owner: 'owner', paused }, preferences)
  await expect(offline('owner-session', next)).rejects.toThrow('not ready')
  getOrCreate.mockResolvedValueOnce({ sessionKey: 'qqbot:123:c2c:owner', sessionId: 'new-owner-session', scope: 'c2c', peerId: 'owner', agent: { status: 'idle', session: { header: { id: 'new-owner-session' } }, whenIdle: async () => {} } })
  await expect(resolve('owner-session', next)).rejects.toThrow('binding changed')
  expect(next).not.toHaveBeenCalled()
})
