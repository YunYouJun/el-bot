import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { QQTranscript } from './transcript'

const paths: string[] = []
afterEach(async () => {
  await Promise.all(paths.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'qq-transcript-'))
  paths.push(directory)
  const store = new QQTranscript(directory, peer => peer === 'group-a')
  await store.load()
  return { store, directory }
}
const inbound = (id = 'one') => ({ kind: 'group', groupOpenid: 'group-a', messageId: id, senderId: 'owner-qq', senderName: 'Owner QQ', content: '**Raw text**', timestamp: '2026-11-07T00:00:00Z', raw: { author: { member_role: 'owner' }, attachments: [{ url: 'https://private.invalid/?token=secret' }] } })

it('records raw inbound messages independently of model output and binds pending traffic to a safe session', async () => {
  const { store, directory } = await fixture()
  await store.inbound(inbound())
  await store.inbound(inbound())
  await store.inbound({ ...inbound('denied'), groupOpenid: 'not-allowed', content: 'private other group' })
  await store.bind('group-a', 'session-first')
  const page = await store.page('session-first')
  expect(page.messages).toMatchObject([{ direction: 'incoming', senderId: 'owner-qq', senderName: 'Owner QQ', senderRole: 'owner', text: '**Raw text**' }])
  expect(page.messages).toHaveLength(1)
  expect(JSON.stringify(page)).not.toMatch(/token=secret|private other group/)
  const restarted = new QQTranscript(directory, peer => peer === 'group-a')
  await restarted.load()
  expect((await restarted.page('session-first')).messages).toEqual(page.messages)
  await store.clear('session-first')
  expect(store.sources()).toEqual({})
  const saved = await Promise.all((await readdir(directory)).map(name => readFile(join(directory, name), 'utf8')))
  expect(saved.join()).not.toContain('**Raw text**')
})

it('shows sending before a receipt and preserves unknown and failed outcomes without inventing delivery', async () => {
  const { store } = await fixture()
  await store.bind('group-a', 'session-live')
  let finish: (value: { id: string }) => void = () => {}
  const network = new Promise<{ id: string }>((resolve) => {
    finish = resolve
  })
  const pending = store.send('group-a', '  literal\n**text**  ', true, () => network)
  await vi.waitFor(async () => expect((await store.page('session-live')).messages[0]?.status).toBe('pending'))
  finish({ id: 'qq-delivered' })
  await pending
  expect((await store.page('session-live')).messages[0]).toMatchObject({ direction: 'outgoing', text: '  literal\n**text**  ', manual: true, status: 'sent', messageId: 'qq-delivered' })
  await store.send('group-a', 'missing receipt', false, async () => ({}))
  await expect(store.send('group-a', 'timeout', false, async () => {
    throw new Error('network')
  })).rejects.toThrow('network')
  await expect(store.send('group-a', 'denied', true, async () => {
    throw Object.assign(new Error('denied'), { bizCode: 40034105 })
  })).rejects.toMatchObject({ bizCode: 40034105 })
  expect((await store.page('session-live')).messages.map(row => row.status)).toEqual(['sent', 'unknown', 'unknown', 'failed'])
})

it('records a passive receipt before any group session and completes it after binding', async () => {
  const { store } = await fixture()
  await store.inbound(inbound())
  let finish: (value: { id: string }) => void = () => {}
  const network = new Promise<{ id: string }>((resolve) => {
    finish = resolve
  })
  const send = vi.fn(() => network)
  await expect(store.send('group-a', 'proactive', false, send)).rejects.toThrow('no active binding')
  expect(send).not.toHaveBeenCalled()
  const receipt = store.send('group-a', '请回私聊确认', false, send, true)
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  await store.bind('group-a', 'session-live')
  expect((await store.page('session-live')).messages.at(-1)?.status).toBe('pending')
  finish({ id: 'qq-reply' })
  await receipt
  expect((await store.page('session-live')).messages.at(-1)).toMatchObject({ status: 'sent', messageId: 'qq-reply' })
})

it('preserves bounded display attachments across middleware mutation and restarts without arbitrary URLs or payload fields', async () => {
  const { store, directory } = await fixture()
  const attachments = [
    { content_type: 'image/jpeg', url: '//multimedia.nt.qq.com.cn/download/photo?rkey=example', filename: '群聊照片.jpg', width: 1200, height: 800, size: 8192, privateField: 'do-not-retain' },
    { content_type: 'image/png', url: 'http://gchat.qpic.cn/example.png' },
    { content_type: 'image/png', url: 'https://gchat.qpic.cn.attacker.invalid/private' },
    { content_type: 'image/svg+xml', url: 'file:///etc/passwd' },
    { content_type: 'audio/silk', url: 'https://private.invalid/audio', filename: 'voice.silk' },
    { content_type: 'application/pdf', filename: 'notes.pdf', size: 20, url: 'https://private.invalid/file' },
  ]
  const event = { ...inbound('images'), attachments }
  const capturing = store.inbound(event)
  attachments[0]!.url = 'https://mutated.invalid/'
  event.attachments = []
  await capturing
  await store.bind('group-a', 'media-session')
  const restarted = new QQTranscript(directory, peer => peer === 'group-a')
  await restarted.load()
  const { messages } = await restarted.page('media-session')
  expect(messages[0]?.attachments).toEqual([
    { kind: 'image', contentType: 'image/jpeg', url: 'https://multimedia.nt.qq.com.cn/download/photo?rkey=example', name: '群聊照片.jpg', width: 1200, height: 800, size: 8192 },
    { kind: 'image', contentType: 'image/png', url: 'https://gchat.qpic.cn/example.png' },
    { kind: 'image', contentType: 'image/png' },
    { kind: 'image', contentType: 'image/svg+xml' },
    { kind: 'voice', contentType: 'audio/silk', name: 'voice.silk' },
    { kind: 'file', contentType: 'application/pdf', name: 'notes.pdf', size: 20 },
  ])
  expect(JSON.stringify(messages)).not.toMatch(/attacker|private\.invalid|do-not-retain|file:\/\/|mutated/)
  await store.clear('media-session')
  const saved = await Promise.all((await readdir(directory)).map(name => readFile(join(directory, name), 'utf8')))
  expect(saved.join()).not.toContain('photo?rkey')
})

it('freezes archived history, moves the rotation-triggering inbound and never swaps ownership', async () => {
  const { store } = await fixture()
  await store.bind('group-a', 'old-session')
  await store.inbound(inbound('old'))
  store.isArchived = id => id === 'old-session'
  await store.inbound(inbound('pending'))
  expect((await store.page('old-session')).messages.map(row => row.messageId)).toEqual(['old'])
  await store.bind('group-a', 'new-session')
  expect((await store.page('new-session')).messages.map(row => row.messageId)).toEqual(['pending'])
  await store.inbound(inbound('rotation'))
  await store.bind('group-a', 'rotated-session', 'rotation')
  expect((await store.page('new-session')).messages.map(row => row.messageId)).toEqual(['pending'])
  expect((await store.page('rotated-session')).messages.map(row => row.messageId)).toEqual(['rotation'])
  const denied = vi.fn(async () => ({ id: 'must-not-send' }))
  await expect(store.send('not-allowed', 'no', true, denied)).rejects.toThrow()
  expect(denied).not.toHaveBeenCalled()
})

it('lists distinct group senders with their latest name, role and activity', async () => {
  const { store } = await fixture()
  await store.bind('group-a', 'members-session')
  const message = (id: string, senderId: string, senderName: string, role: string, timestamp: string) => ({
    ...inbound(id),
    senderId,
    senderName,
    timestamp,
    raw: { author: { member_role: role } },
  })
  await store.inbound(message('one', 'member-1', '旧昵称', 'member', '2026-11-07T00:00:00Z'))
  await store.inbound(message('two', 'member-2', '管理员甲', 'admin', '2026-11-07T01:00:00Z'))
  await store.inbound(message('three', 'member-1', '新昵称', 'owner', '2026-11-07T02:00:00Z'))
  await store.inbound(message('three', 'member-1', '新昵称', 'owner', '2026-11-07T02:00:00Z'))
  expect(await store.members('group-a')).toEqual([
    { senderId: 'member-1', senderName: '新昵称', senderRole: 'owner', lastMessageAt: '2026-11-07T02:00:00.000Z', messageCount: 2 },
    { senderId: 'member-2', senderName: '管理员甲', senderRole: 'admin', lastMessageAt: '2026-11-07T01:00:00.000Z', messageCount: 1 },
  ])
  await expect(store.members('not-allowed')).rejects.toThrow('unavailable')
})

it('keeps history and member activity isolated by group when the sender identity is shared', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-transcript-'))
  paths.push(directory)
  const store = new QQTranscript(directory, peer => peer === 'group-a' || peer === 'group-b')
  await store.load()
  await store.bind('group-a', 'session-a')
  await store.bind('group-b', 'session-b')
  await store.inbound({ ...inbound('group-a-message'), groupOpenid: 'group-a', senderId: 'shared-member', content: 'only in group A' })
  await store.inbound({ ...inbound('group-b-message'), groupOpenid: 'group-b', senderId: 'shared-member', content: 'only in group B' })

  expect(await store.members('group-a')).toEqual([
    { senderId: 'shared-member', senderName: 'Owner QQ', senderRole: 'owner', lastMessageAt: '2026-11-07T00:00:00.000Z', messageCount: 1 },
  ])
  expect(await store.members('group-b')).toEqual([
    { senderId: 'shared-member', senderName: 'Owner QQ', senderRole: 'owner', lastMessageAt: '2026-11-07T00:00:00.000Z', messageCount: 1 },
  ])
  expect((await store.page('session-a')).messages.map(row => row.text)).toEqual(['only in group A'])
  expect((await store.page('session-b')).messages.map(row => row.text)).toEqual(['only in group B'])
})
