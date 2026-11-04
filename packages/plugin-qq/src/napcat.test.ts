import type { MessageContext } from 'el-bot/adapter'
import type { NapcatMessage } from './napcat'
import { describe, expect, it, vi } from 'vitest'
import { createNapcatClient, NapcatAdapter, replyNapcatMessage } from './napcat'

function fixture() {
  const client = createNapcatClient({ protocol: 'ws', host: '127.0.0.1', port: 1, accessToken: '' })
  vi.spyOn(client, 'connect').mockResolvedValue()
  vi.spyOn(client, 'disconnect').mockResolvedValue()
  vi.spyOn(client, 'get_version_info').mockResolvedValue({ app_name: 'NapCat.Onebot', app_version: '1', protocol_version: 'v11' })
  vi.spyOn(client, 'get_login_info').mockResolvedValue({ user_id: 100, nickname: 'bot' })
  vi.spyOn(client, 'send_private_msg').mockResolvedValue({ message_id: 1 })
  vi.spyOn(client, 'send_group_msg').mockResolvedValue({ message_id: 2 })
  const message: NapcatMessage = {
    message_type: 'private',
    sub_type: 'friend',
    self_id: 100,
    message_id: 3,
    sender: { user_id: 200 },
    raw_message: 'hello',
    message: [{ type: 'text', data: { text: 'hello' } }],
  } as NapcatMessage
  return { client, message }
}

describe('qQ NapCat adapter', () => {
  it('maps native messages, retains legacy replies, and removes listeners on restart', async () => {
    const { client, message } = fixture()
    const adapter = new NapcatAdapter({ client })
    const messages: MessageContext[] = []
    const dispatch = vi.fn(async (context: MessageContext) => {
      messages.push(context)
    })
    await adapter.start(dispatch)
    client.emit('message', message)
    expect(messages[0]).toMatchObject({ platform: 'qq', accountId: '100', text: 'hello', raw: message, chat: { id: '200', type: 'dm' } })
    await messages[0].reply('pong')
    expect(client.send_private_msg).toHaveBeenCalledWith({ user_id: 200, message: [{ type: 'text', data: { text: 'pong' } }] })
    await adapter.stop()
    client.emit('message', message)
    expect(dispatch).toHaveBeenCalledTimes(1)
    await adapter.start(dispatch)
    client.emit('message', message)
    expect(dispatch).toHaveBeenCalledTimes(2)
    await adapter.stop()
  })

  it('routes proactive group messages and rejects nonnumeric recipients', async () => {
    const { client } = fixture()
    const adapter = new NapcatAdapter({ client })
    await adapter.send({ id: '300', type: 'group' }, 'notice')
    expect(client.send_group_msg).toHaveBeenCalledWith({ group_id: 300, message: [{ type: 'text', data: { text: 'notice' } }] })
    await expect(adapter.send({ id: 'not-a-qq-id', type: 'dm' }, 'notice')).rejects.toThrow('positive numeric IDs')
  })

  it('preserves caller-owned message segments when adding a quote', async () => {
    const { client, message } = fixture()
    const content = [{ type: 'text' as const, data: { text: 'hello' } }]
    await replyNapcatMessage(client, message, content, true)
    expect(content).toHaveLength(1)
    expect(client.send_private_msg).toHaveBeenCalledWith({ user_id: 200, message: [{ type: 'reply', data: { id: '3' } }, ...content] })
  })
})
