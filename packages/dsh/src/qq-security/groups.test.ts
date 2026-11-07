import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { QQGroupDirectory } from './groups'
import { QQConversationMetadataStore } from './metadata'
import { QQSecurity } from './policy'
import { SecurityStore } from './store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), 'qq-group-directory-'))
  directories.push(path)
  const preferences = join(path, 'preferences.json')
  await writeFile(preferences, JSON.stringify({ sessionIds: { 'qqbot:123:group:allowed': 'old-session', 'qqbot:123:group:legacy': 'legacy-session', 'qqbot:999:group:foreign': 'foreign-session' } }))
  const policy = new QQSecurity({ appId: '123', ownerOpenId: 'owner' }, new SecurityStore(join(path, 'security.json')), '/groups')
  const metadata = new QQConversationMetadataStore('123', join(path, 'metadata.json'), preferences, (scope, peer) => policy.allowed(scope, peer))
  metadata.bind(async route => route.endsWith('/info') ? { group_name: 'Test group', group_member_num: 12 } : { member_role: 'member' })
  const groups = new QQGroupDirectory('123', join(path, 'groups.json'), preferences, policy, metadata)
  await groups.load()
  const manager = {
    getOrCreate: vi.fn(async () => ({ sessionId: 'fresh-session' })),
    remove: vi.fn(async () => { await writeFile(preferences, JSON.stringify({ sessionIds: {} })) }),
    getSessionRecord: () => undefined,
  }
  groups.manager = manager as unknown as NonNullable<QQGroupDirectory['manager']>
  groups.clearHistory = vi.fn()
  return { path, preferences, policy, metadata, groups, manager }
}

it('opens a discovered group without configuration while retaining membership checks', async () => {
  const f = await fixture()
  f.groups.event('GROUP_ADD_ROBOT', { group_openid: 'new-group' })
  expect((await f.groups.list()).find(row => row.id === 'new-group')).toMatchObject({ allowed: true, membership: 'joined' })
  expect(f.groups.canChat('new-group')).toBe(true)
  expect(await f.groups.open('new-group')).toBe('fresh-session')
  await expect(f.groups.open('not-discovered')).rejects.toThrow('unavailable')
  f.groups.event('GROUP_DEL_ROBOT', { group_openid: 'new-group' })
  expect(f.groups.canChat('new-group')).toBe(false)
  await expect(f.groups.open('new-group')).rejects.toThrow('unavailable')
  await f.groups.close()
  await f.metadata.close()
})

it('keeps independent membership across history deletion and restart', async () => {
  const f = await fixture()
  const message = { kind: 'group', groupOpenid: 'allowed', senderId: 'owner', messageId: 'message', content: 'private history', timestamp: '2026-11-07T00:00:00Z' }
  f.metadata.observe(message)
  f.groups.observe(message)
  f.groups.event('GROUP_ADD_ROBOT', { group_openid: 'new-group', timestamp: '2026-11-07T00:00:00Z', content: 'not retained' })
  let rows = await f.groups.list()
  expect(rows.find(row => row.id === 'allowed')).toMatchObject({ membership: 'joined', sessionId: 'old-session', source: { name: 'Test group', memberCount: 12 } })
  expect(rows.find(row => row.id === 'legacy')).toMatchObject({ membership: 'unknown', allowed: true })
  expect(rows.find(row => row.id === 'new-group')).toMatchObject({ membership: 'joined', allowed: true })
  expect(rows.find(row => row.id === 'foreign')).toBeUndefined()
  expect(JSON.stringify(rows)).not.toContain('private history')
  await f.groups.withSession('old-session', detach => detach(true))
  expect(f.groups.clearHistory).toHaveBeenCalledExactlyOnceWith('allowed')
  expect(f.manager.remove).toHaveBeenCalledExactlyOnceWith('group', 'allowed')
  expect(await readFile(join(f.path, 'metadata.json'), 'utf8')).not.toContain('private history')
  rows = await f.groups.list()
  expect(rows.find(row => row.id === 'allowed')).toMatchObject({ membership: 'joined', source: { name: 'Test group' } })
  expect(rows.find(row => row.id === 'allowed')?.sessionId).toBeUndefined()
  expect(await f.groups.open('allowed')).toBe('fresh-session')
  expect(f.manager.getOrCreate).toHaveBeenCalledExactlyOnceWith('group', 'allowed', 'owner', { scope: 'group', targetId: 'allowed', msgId: '' })
  expect(f.groups.canChat('new-group')).toBe(true)
  await f.groups.close()
  const restarted = new QQGroupDirectory('123', join(f.path, 'groups.json'), f.preferences, f.policy, f.metadata)
  await restarted.load()
  expect((await restarted.list()).map(row => row.id)).toContain('allowed')
  restarted.event('GROUP_DEL_ROBOT', { group_openid: 'allowed', timestamp: '2026-11-07T00:02:00Z' })
  restarted.event('GROUP_ADD_ROBOT', { group_openid: 'allowed', timestamp: '2026-11-07T00:01:00Z' })
  expect((await restarted.list()).find(row => row.id === 'allowed')?.membership).toBe('left')
  await expect(restarted.open('allowed')).rejects.toThrow('Group is unavailable')
  await restarted.close()
  await f.metadata.close()
})

it('serializes management with admission and ignores a binding that changed while waiting', async () => {
  const f = await fixture()
  let release: () => void = () => {}
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  const admission = f.policy.exclusive('group', 'allowed', async () => {
    await hold
    await writeFile(f.preferences, JSON.stringify({ sessionIds: { 'qqbot:123:group:allowed': 'newer-session' } }))
  })
  const deletion = f.groups.withSession('old-session', detach => detach(true))
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(f.manager.remove).not.toHaveBeenCalled()
  release()
  await Promise.all([admission, deletion])
  expect(f.manager.remove).not.toHaveBeenCalled()
  expect(f.groups.clearHistory).not.toHaveBeenCalled()
  await f.groups.close()
  await f.metadata.close()
})

it('keeps an archived binding until fresh traffic opens a new context', async () => {
  const f = await fixture()
  let archived = false
  f.groups.isArchived = () => archived
  await f.groups.beforeOpen('group', 'allowed')
  expect(f.manager.remove).not.toHaveBeenCalled()
  archived = true
  await f.groups.beforeOpen('group', 'allowed')
  expect(f.manager.remove).toHaveBeenCalledExactlyOnceWith('group', 'allowed')
  expect(f.groups.clearHistory).toHaveBeenCalledExactlyOnceWith('allowed')
  expect((await f.groups.list()).some(row => row.id === 'allowed')).toBe(true)
  await f.groups.close()
  await f.metadata.close()
})
