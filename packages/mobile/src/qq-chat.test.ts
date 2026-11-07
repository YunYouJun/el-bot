import type { QQChatService } from './qq-chat'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { QQChatAdapter } from './qq-chat'

it('binds owner preview grants to device and session and keeps only identifiers across restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-mobile-grants-'))
  const path = join(directory, 'grants.json')
  const request = vi.fn(async (_id: string, input: Record<string, unknown>) => input.operation === 'preview'
    ? { id: 'preview-one', text: input.text, expiresAt: Date.now() + 120_000 }
    : { id: input.preview, status: 'sent' })
  const service: QQChatService = { view: async () => ({ online: true }), request, sources: () => ({}) }
  try {
    const adapter = new QQChatAdapter(path, () => service)
    await adapter.load()
    await adapter.request('first-device', 'session-one', { operation: 'preview', text: 'private original' })
    expect(await readFile(path, 'utf8')).not.toContain('private original')
    await expect(adapter.request('second-device', 'session-one', { operation: 'send', preview: 'preview-one' })).rejects.toThrow('preview_expired')
    await expect(adapter.request('first-device', 'another-session', { operation: 'send', preview: 'preview-one' })).rejects.toThrow('preview_expired')
    expect(request).toHaveBeenCalledTimes(1)
    const restarted = new QQChatAdapter(path, () => service)
    await restarted.load()
    expect(await restarted.request('first-device', 'session-one', { operation: 'send', preview: 'preview-one' })).toEqual({ delivery: { id: 'preview-one', status: 'sent' } })
    await expect(restarted.request('first-device', 'session-one', { operation: 'shell' })).rejects.toThrow('invalid_request')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('reads member impressions without widening the preview grant surface', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-mobile-member-'))
  try {
    const service: QQChatService = {
      view: async () => ({ online: true }),
      request: async () => ({}),
      member: async (sessionId, senderId) => ({ sessionId, senderId, impression: { text: '喜欢猫', updatedAt: '2026-11-07T08:00:00.000Z' } }),
      sources: () => ({}),
    }
    const adapter = new QQChatAdapter(join(directory, 'grants.json'), () => service)
    await adapter.load()
    expect(await adapter.member('session-one', 'member-1')).toMatchObject({ senderId: 'member-1', impression: { text: '喜欢猫' } })
    const older: QQChatService = { view: async () => ({ online: true }), request: async () => ({}), sources: () => ({}) }
    await expect(new QQChatAdapter(join(directory, 'grants.json'), () => older).member('session-one', 'member-1')).rejects.toThrow('qq_chat_unavailable')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
