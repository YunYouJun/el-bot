import type { AddressInfo } from 'node:net'
import type { MessageContext } from '../core/adapter'
import { once } from 'node:events'
import { createServer } from 'node:http'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { qqPlugin } from '../../plugin-qq/src/index'
import { Bot } from '../core/bot'
import { unsetCurrentInstance } from '../core/composition-api/lifecycle'

vi.mock('../node/server', () => ({ createServer: () => ({ close: vi.fn() }) }))
vi.mock('../core/utils/misc', () => ({ statement: vi.fn() }))

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
  unsetCurrentInstance()
})

describe('official QQ platform plugin integration', () => {
  it('receives full group content without NapCat and keeps group commands, dedup and C2C replies scoped', async () => {
    const sends: { url: string, auth?: string, body: unknown }[] = []
    let base = ''
    const server = createServer(async (req, res) => {
      if (req.url === '/token') {
        res.end(JSON.stringify({ access_token: 'fake-token', expires_in: 7200 }))
        return
      }
      if (req.url === '/gateway') {
        res.end(JSON.stringify({ url: base.replace('http:', 'ws:') }))
        return
      }
      let body = ''
      for await (const chunk of req) body += chunk
      sends.push({ url: req.url!, auth: req.headers.authorization, body: JSON.parse(body) })
      res.end(JSON.stringify({ id: 'reply' }))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())))
    const gateway = new WebSocketServer({ server })
    cleanup.push(() => {
      for (const socket of gateway.clients) socket.terminate()
      return new Promise<void>(resolve => gateway.close(() => resolve()))
    })
    const identified = vi.fn()
    gateway.on('connection', (socket) => {
      socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 60000 } }))
      socket.on('message', (data) => {
        const frame = JSON.parse(data.toString())
        if (frame.op === 2) {
          identified(frame.d)
          socket.send(JSON.stringify({ op: 0, t: 'READY', s: 1, d: { session_id: 'session' } }))
        }
      })
    })
    const napcat = vi.spyOn(Bot.prototype, 'napcat', 'get')
    vi.spyOn(process, 'on').mockReturnValue(process)
    const messages: MessageContext[] = []
    const command = vi.fn(() => 'pong')
    const bot = new Bot({
      legacyQQ: false,
      bot: {
        name: '小云',
        autoloadPlugins: false,
        plugins: [
          qqPlugin({ type: 'official', appId: 'app', secret: 'fake-secret', apiBase: base, tokenUrl: `${base}/token` }),
          {
            setup(ctx) {
              ctx.command('ping').action(command)
              ctx.hooks.hook('onSession', (message) => {
                messages.push(message)
              })
            },
          },
        ],
      },
    })
    cleanup.push(() => bot.stop())
    await bot.start()
    await vi.waitFor(() => expect(identified).toHaveBeenCalledOnce())
    expect(identified).toHaveBeenCalledWith(expect.objectContaining({ intents: 1 << 25 }))
    let sequence = 1
    const send = (t: string, data: Record<string, unknown>) => {
      for (const socket of gateway.clients) socket.send(JSON.stringify({ op: 0, t, s: ++sequence, d: data }))
    }
    const group = {
      id: 'ordinary',
      group_openid: 'group/a',
      author: { member_openid: 'member', username: '小明' },
      content: 'ping',
      timestamp: new Date().toISOString(),
    }
    send('GROUP_MESSAGE_CREATE', group)
    const rich = { ...group, id: 'rich', content: undefined, message_type: 3, ark_data: { fields: { title: 'ping' } }, attachments: [{ content_type: 'image/jpeg', url: 'https://example.com/image.jpg' }] }
    send('GROUP_MESSAGE_CREATE', rich)
    send('GROUP_AT_MESSAGE_CREATE', { ...group, id: 'at', group_openid: 'another-group' })
    send('GROUP_MESSAGE_CREATE', { ...group, id: 'named', content: '小云 ping' })
    send('C2C_MESSAGE_CREATE', { id: 'private', author: { user_openid: 'owner' }, content: 'ping', timestamp: group.timestamp })
    send('GROUP_MESSAGE_CREATE', group)
    await vi.waitFor(() => expect(sends).toHaveLength(3))
    expect(command).toHaveBeenCalledTimes(3)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ id: 'ordinary', text: 'ping', addressed: false, chat: { type: 'group', id: 'group/a' }, sender: { id: 'member', name: '小明' } })
    expect(messages[1]).toMatchObject({ id: 'rich', text: '', raw: { ark_data: rich.ark_data, attachments: rich.attachments } })
    expect(sends).toEqual([
      { url: '/v2/groups/another-group/messages', auth: 'QQBot fake-token', body: { msg_type: 0, content: 'pong', msg_id: 'at', msg_seq: 1 } },
      { url: '/v2/groups/group%2Fa/messages', auth: 'QQBot fake-token', body: { msg_type: 0, content: 'pong', msg_id: 'named', msg_seq: 1 } },
      { url: '/v2/users/owner/messages', auth: 'QQBot fake-token', body: { msg_type: 0, content: 'pong', msg_id: 'private', msg_seq: 1 } },
    ])
    expect(napcat).not.toHaveBeenCalled()
  })
})
