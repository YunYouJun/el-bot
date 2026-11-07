import type { QQGroupDirectory } from './groups'
import type { ManualPreview } from './manual-types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { QQMemberImpressions } from './impressions'
import { ManualControl } from './manual'
import { NativeQQChat } from './native-chat'
import { digest, QQSecurity } from './policy'
import { SecurityStore } from './store'
import { QQTranscript } from './transcript'

it('scopes native takeover to the current allowed group and sends exact confirmed text once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-qq-chat-'))
  try {
    const target = { id: digest('allowed'), peerId: 'allowed', scope: 'group' as const, sessionId: 'current-session', title: 'Test group' }
    const send = vi.fn(async () => ({ id: 'qq-confirmed-message' }))
    const drain = vi.fn(async () => {})
    const policy = new QQSecurity({ appId: '123', ownerOpenId: 'owner' }, new SecurityStore(join(directory, 'security.json')), '/groups')
    const transcript = new QQTranscript(join(directory, 'transcript'), peer => policy.allowed('group', peer))
    await transcript.load()
    const manual = new ManualControl(join(directory, 'manual.json'), { targets: async () => [target], send, drain, quota: async () => true, reserveReply: () => {} })
    await manual.initialize()
    manual.online = true
    let archived = false
    let joined = true
    const groups = {
      sessionPeer: async (id: string) => id === target.sessionId
        ? { scope: 'group', peerId: 'allowed' }
        : id === 'other-session'
          ? { scope: 'group', peerId: 'other-group' }
          : undefined,
      isArchived: () => archived,
      canChat: () => joined,
    } as unknown as QQGroupDirectory
    const impressions = new QQMemberImpressions(join(directory, 'impressions.json'))
    await impressions.load()
    await impressions.set('allowed', 'member-1', '喜欢猫')
    const native = new NativeQQChat(transcript, manual, groups, policy, impressions)
    await expect(native.view('someone-elses-session')).rejects.toThrow('not_found')
    expect(await native.member(target.sessionId, 'member-1')).toEqual({ senderId: 'member-1', impression: { text: '喜欢猫', updatedAt: expect.any(String) } })
    expect(await native.member('other-session', 'member-1')).toEqual({ senderId: 'member-1', impression: { text: '喜欢猫', updatedAt: expect.any(String) } })
    expect(await native.member('other-session', 'member-2')).toEqual({ senderId: 'member-2' })
    await expect(native.member(target.sessionId, 'not a sender')).rejects.toThrow('invalid_request')
    await native.request(target.sessionId, { operation: 'begin', target: 'attacker-controlled-target' })
    expect(drain).toHaveBeenCalledExactlyOnceWith(target)
    const view = await native.view(target.sessionId)
    expect(view.control?.lease?.phase).toBe('active')
    const text = '  手动原文\n**保持原样**  '
    const preview = await native.request(target.sessionId, { operation: 'preview', lease: view.control!.lease!.id, text, mode: 'proactive' }) as ManualPreview
    expect(send).not.toHaveBeenCalled()
    await Promise.all(Array.from({ length: 4 }, () => native.request(target.sessionId, { operation: 'send', preview: preview.id })))
    expect(send).toHaveBeenCalledExactlyOnceWith(target, text, 'proactive', undefined)
    await native.request(target.sessionId, { operation: 'end', lease: view.control!.lease!.id })
    expect((await native.view(target.sessionId)).control?.lease).toBeUndefined()
    archived = true
    await expect(native.request(target.sessionId, { operation: 'begin' })).rejects.toThrow('stale_session')
    archived = false
    joined = false
    await expect(native.request(target.sessionId, { operation: 'begin' })).rejects.toThrow('stale_session')
    expect(send).toHaveBeenCalledTimes(1)
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
