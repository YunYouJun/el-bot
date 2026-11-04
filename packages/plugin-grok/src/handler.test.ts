import type { MessageContext } from 'el-bot/adapter'
import { describe, expect, it, vi } from 'vitest'
import { createGrokMessageHandler } from './handler'

const conversation = { adapterId: 'work', accountId: 'account', chatId: 'owner', senderId: 'owner' }

function message(overrides: Partial<MessageContext> = {}): MessageContext {
  return { adapterId: 'work', accountId: 'account', platform: 'wecom', chat: { id: 'owner', type: 'dm' }, sender: { id: 'owner' }, id: 'msg-1', text: 'hello', addressed: true, reply: vi.fn().mockResolvedValue({ errcode: 0 }), ...overrides }
}

describe('grok message admission and delivery', () => {
  it('rejects another sender, chat, account or adapter before contacting Grok', async () => {
    const ask = vi.fn().mockResolvedValue('answer')
    const handler = createGrokMessageHandler({ responder: { ask }, conversation })
    for (const input of [message({ sender: { id: 'other' } }), message({ chat: { type: 'group', id: 'owner' } }), message({ accountId: 'other' }), message({ adapterId: 'other' })]) {
      await handler(input)
      expect(input.reply).not.toHaveBeenCalled()
    }
    expect(ask).not.toHaveBeenCalled()
  })

  it('deduplicates and admits only one Grok turn at a time', async () => {
    let finish!: (text: string) => void
    const ask = vi.fn(() => new Promise<string>((resolve) => {
      finish = resolve
    }))
    const handler = createGrokMessageHandler({ responder: { ask }, conversation })
    const first = message()
    const running = handler(first)
    await handler(first)
    const second = message({ id: 'msg-2' })
    await handler(second)
    expect(second.reply).toHaveBeenCalledWith('正在处理上一条问题，请稍后再发。')
    finish('answer')
    await running
    expect(ask).toHaveBeenCalledTimes(1)
    expect(first.reply).toHaveBeenCalledExactlyOnceWith('answer')
  })

  it('reports a reply rejection without claiming delivery or exposing the error', async () => {
    const onEvent = vi.fn()
    const handler = createGrokMessageHandler({ responder: { ask: vi.fn().mockResolvedValue('answer') }, conversation, onEvent })
    await handler(message({ reply: vi.fn().mockRejectedValue(new Error('private-secret')) }))
    expect(onEvent.mock.calls.map(call => call[0])).toEqual(['received', 'answered', 'reply-failed'])
  })
})
