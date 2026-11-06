import type { MessageContext } from 'el-bot/adapter'
import type { C2CMessage, GatewayOptions, GroupMessage, GroupMessageEvent } from 'qq-sdk/official'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfficialQQAdapter } from './official'

const state = vi.hoisted(() => ({
  onMessage: async (_message: C2CMessage) => {},
  onGroupMessage: async (_message: GroupMessage) => {},
  reply: vi.fn().mockResolvedValue(undefined),
  replyGroup: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('qq-sdk/official', () => ({
  QQBotClient: class {
    reply = state.reply
    replyGroup = state.replyGroup
  },
  QQGateway: class {
    constructor(_client: unknown, options: GatewayOptions) {
      state.onMessage = options.onMessage
      state.onGroupMessage = options.onGroupMessage!
    }

    start = state.start
    stop = state.stop
  },
}))

beforeEach(() => vi.clearAllMocks())

function group(id: string, groupOpenId = 'group', eventType: GroupMessageEvent = 'GROUP_MESSAGE_CREATE'): GroupMessage {
  const raw = {
    id,
    group_openid: groupOpenId,
    author: { member_openid: `sender-${id}`, username: '小明' },
    content: 'ping',
    timestamp: '2026-11-04T00:00:00Z',
    attachments: [{ content_type: 'image/jpeg', url: 'https://example.com/image.jpg' }],
  }
  return { ...raw, eventType, raw }
}

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

  it('receives ordinary and @ group messages and binds replies to each group and incoming message', async () => {
    const adapter = new OfficialQQAdapter({ appId: 'app', secret: 'fake-secret' })
    const messages: MessageContext[] = []
    await adapter.start(async (message) => {
      messages.push(message)
    })
    const first = group('one')
    await state.onGroupMessage(first)
    await state.onGroupMessage(group('two', 'group', 'GROUP_AT_MESSAGE_CREATE'))
    await state.onGroupMessage(group('three', 'another-group'))
    expect(messages[0]).toMatchObject({
      platform: 'qq',
      adapterId: 'qq:official:app',
      accountId: 'app',
      sender: { id: 'sender-one', name: '小明' },
      chat: { id: 'group', type: 'group' },
      text: 'ping',
      addressed: false,
    })
    expect(messages[0].raw).toBe(first.raw)
    expect(messages[1].addressed).toBe(true)
    await messages[2].reply('another group')
    await messages[0].reply('first')
    await messages[1].reply('second')
    await messages[0].reply('follow-up')
    expect(state.replyGroup.mock.calls).toEqual([
      ['another-group', 'three', 'another group', 1],
      ['group', 'one', 'first', 1],
      ['group', 'two', 'second', 1],
      ['group', 'one', 'follow-up', 2],
    ])
    expect(state.reply).not.toHaveBeenCalled()
    adapter.stop()
  })

  it('deduplicates group redelivery, keeps groups independent and retries failed dispatch', async () => {
    const adapter = new OfficialQQAdapter({ appId: 'app', secret: 'fake-secret' })
    const dispatch = vi.fn(async (_message: MessageContext) => {})
    await adapter.start(dispatch)
    await state.onGroupMessage(group('one'))
    await state.onGroupMessage(group('one'))
    await state.onGroupMessage(group('one', 'group', 'GROUP_AT_MESSAGE_CREATE'))
    expect(dispatch).toHaveBeenCalledTimes(1)
    await state.onGroupMessage(group('one', 'another-group'))
    expect(dispatch).toHaveBeenCalledTimes(2)
    dispatch.mockRejectedValueOnce(new Error('temporary failure'))
    await expect(state.onGroupMessage(group('retry'))).rejects.toThrow('temporary failure')
    await state.onGroupMessage(group('retry'))
    expect(dispatch).toHaveBeenCalledTimes(4)
    adapter.stop()
    await adapter.start(dispatch)
    await state.onGroupMessage(group('one'))
    expect(dispatch).toHaveBeenCalledTimes(5)
    adapter.stop()
  })
})
