import type { MessageContext } from 'el-bot/adapter'
import type { C2CMessage } from 'qq-sdk/official'
import { describe, expect, it, vi } from 'vitest'
import { OfficialQQAdapter } from './official'

const state = vi.hoisted(() => ({
  onMessage: async (_message: C2CMessage) => {},
  reply: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('qq-sdk/official', () => ({
  QQBotClient: class { reply = state.reply },
  QQGateway: class {
    constructor(_client: unknown, options: { onMessage: (message: C2CMessage) => Promise<void> }) {
      state.onMessage = options.onMessage
    }

    start = state.start
    stop = state.stop
  },
}))

describe('official QQ adapter', () => {
  it('binds each passive reply to its sender, message identity and independent sequence', async () => {
    const adapter = new OfficialQQAdapter({ appId: 'app', secret: 'fake-secret' })
    const messages: MessageContext[] = []
    await adapter.start(async (message) => {
      messages.push(message)
    })
    for (const id of ['one', 'two']) {
      await state.onMessage({ id, author: { user_openid: `sender-${id}` }, content: 'ping', timestamp: '2026-11-04T00:00:00Z' })
    }
    expect(messages[0]).toMatchObject({ platform: 'qq', adapterId: 'qq:official:app', accountId: 'app', chat: { id: 'sender-one', type: 'dm' } })
    await messages[0].reply('first')
    await messages[1].reply('second')
    await messages[0].reply('follow-up')
    expect(state.reply.mock.calls).toEqual([
      ['sender-one', 'one', 'first', 1],
      ['sender-two', 'two', 'second', 1],
      ['sender-one', 'one', 'follow-up', 2],
    ])
    adapter.stop()
    expect(state.stop).toHaveBeenCalledTimes(1)
  })
})
