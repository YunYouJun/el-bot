import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { QQConversationMetadataStore } from './metadata'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'qq-display-metadata-'))
  directories.push(directory)
  const preferences = join(directory, 'preferences.json')
  const path = join(directory, 'metadata.json')
  await writeFile(preferences, JSON.stringify({ sessionIds: {
    'qqbot:123:group:allowed': 'group-session',
    'qqbot:123:group:other': 'other-session',
    'qqbot:123:c2c:owner': 'private-session',
    'qqbot:999:group:allowed': 'foreign-session',
  } }))
  const now = { value: Date.now() }
  const store = new QQConversationMetadataStore('123', path, preferences, (scope, peer) => scope === 'group' ? peer === 'allowed' : peer === 'owner', () => now.value)
  return { store, path, preferences, now }
}

const message = {
  kind: 'group',
  groupOpenid: 'allowed',
  senderId: 'member',
  senderName: 'Alice',
  messageId: 'message-1',
  content: 'Hello',
  timestamp: '2026-11-07T00:00:00Z',
  senderIsBot: false,
  raw: { author: { member_role: 'admin' }, message_scene: { ext: ['auth_token=private-token'] }, attachments: [{ content_type: 'image/png', url: 'https://private.example/file?token=secret' }] },
}

it('exposes metadata only for allowed peers and matching persisted session identities', async () => {
  const { store } = await fixture()
  store.observe(message)
  store.observe({ ...message, groupOpenid: 'other', content: 'Other group secret' })
  store.observe({ ...message, kind: 'c2c', groupOpenid: undefined, senderId: 'owner', senderName: 'Owner' })
  const result = await store.summaries(['group-session', 'other-session', 'private-session', 'foreign-session', 'unknown'])
  expect(Object.keys(result)).toEqual(['group-session', 'private-session'])
  expect(result['group-session']?.lastMessage).toMatchObject({ senderName: 'Alice', senderRole: 'admin', senderIsBot: false, type: 'image' })
  expect(result['private-session']?.name).toBe('Owner')
  expect(JSON.stringify(result)).not.toMatch(/private-token|private.example|Other group secret/)
  await store.close()
})

it('coalesces read-only profile requests, keeps messages received during fetch, and caches results', async () => {
  const { store, now } = await fixture()
  let complete: (value: unknown) => void = () => {}
  const info = new Promise((resolve) => {
    complete = resolve
  })
  const read = vi.fn((path: string) => path.endsWith('/info') ? info : Promise.resolve({ member_role: 'member', joined_at: '2026-01-01T00:00:00Z', recv_msg_setting: 'all', allow_proactive_msg: false }))
  store.bind(read)
  const a = store.details('group-session')
  const b = store.details('group-session')
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  store.observe(message)
  complete({ group_name: 'Book club', group_finger_memo: 'Read together', group_member_num: 42, group_class_text: 'Culture', group_tags: ['Books'], auth_token: 'must-not-escape' })
  const [first, second] = await Promise.all([a, b])
  expect(first).toEqual(second)
  expect(first).toMatchObject({ name: 'Book club', memberCount: 42, tags: ['Books'], groupInfoStatus: 'available', botStateStatus: 'available', bot: { receiveMode: 'all', allowProactive: false }, lastMessage: { senderName: 'Alice' } })
  expect(JSON.stringify(first)).not.toContain('must-not-escape')
  await store.details('group-session')
  expect(read).toHaveBeenCalledTimes(2)
  now.value += 5 * 60_000 + 1
  await store.details('group-session')
  expect(read).toHaveBeenCalledTimes(4)
  await store.close()
})

it('reports denied and failed endpoints without rejecting conversation details or retrying each poll', async () => {
  const { store } = await fixture()
  const read = vi.fn(async (path: string) => {
    throw path.endsWith('/info') ? { bizCode: 11253 } : new Error('network failure containing credentials')
  })
  store.bind(read)
  expect(await store.details('group-session')).toMatchObject({ groupInfoStatus: 'forbidden', botStateStatus: 'unavailable', peerId: 'allowed' })
  await store.details('group-session')
  expect(read).toHaveBeenCalledTimes(2)
  expect(await store.details('other-session')).toBeUndefined()
  expect(read).toHaveBeenCalledTimes(2)
  await store.close()
})

it('persists bounded display fields and restores media type without raw events or credentials', async () => {
  const { store, path, preferences } = await fixture()
  store.observe({ ...message, content: 'a'.repeat(1000) })
  store.observe({ ...message, messageId: 'older', timestamp: '2026-11-06T00:00:00Z', content: 'Out of order' })
  await store.close()
  const persisted = await readFile(path, 'utf8')
  expect(persisted).not.toMatch(/auth_token|private-token|private.example|Out of order/)
  const restored = new QQConversationMetadataStore('123', path, preferences, () => true)
  await restored.load()
  const result = (await restored.summaries(['group-session']))['group-session']
  expect(result?.lastMessage?.text).toHaveLength(160)
  expect(result?.lastMessage?.type).toBe('image')
  await restored.close()
})
