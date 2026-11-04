import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { wecomPlugin } from '../../plugin-wecom/src/plugin'
import { Bot } from '../core/bot'
import { unsetCurrentInstance } from '../core/composition-api/lifecycle'

vi.mock('../node/server', () => ({ createServer: () => ({ close: vi.fn() }) }))
vi.mock('../core/utils/misc', () => ({ statement: vi.fn() }))

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
  unsetCurrentInstance()
})

describe('weCom platform plugin integration', () => {
  it('runs without NapCat, replies through the SDK, sends proactively, and restarts without duplicate handlers', async () => {
    const frames: Record<string, unknown>[] = []
    const sockets: import('ws').WebSocket[] = []
    const gateway = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await once(gateway, 'listening')
    cleanup.push(() => new Promise<void>(resolve => gateway.close(() => resolve())))
    gateway.on('connection', (socket) => {
      sockets.push(socket)
      socket.on('error', () => {})
      socket.on('message', (data) => {
        const frame = JSON.parse(data.toString())
        frames.push(frame)
        socket.send(JSON.stringify({ headers: frame.headers, errcode: 0, errmsg: 'ok' }))
      })
    })
    const napcat = vi.spyOn(Bot.prototype, 'napcat', 'get')
    vi.spyOn(process, 'on').mockReturnValue(process)
    const bot = new Bot({
      bot: {
        autoloadPlugins: false,
        plugins: [
          wecomPlugin({ id: 'work', botId: 'fake-bot', secret: 'fake-secret', wsUrl: `ws://127.0.0.1:${(gateway.address() as AddressInfo).port}`, maxReconnectAttempts: 0 }),
          { setup(ctx) { ctx.command('ping').action(() => 'pong') } },
        ],
      },
    })
    cleanup.push(() => bot.stop())
    const sendIncoming = (id: string) => sockets.at(-1)!.send(JSON.stringify({
      cmd: 'aibot_msg_callback',
      headers: { req_id: id },
      body: { msgid: id, chattype: 'single', from: { userid: 'owner' }, msgtype: 'text', text: { content: 'ping' } },
    }))
    await bot.start()
    expect(napcat).not.toHaveBeenCalled()
    sendIncoming('first')
    await vi.waitFor(() => expect(frames.filter(frame => frame.cmd === 'aibot_respond_msg')).toHaveLength(1))
    const reply = frames.find(frame => frame.cmd === 'aibot_respond_msg')
    expect(reply).toMatchObject({ headers: { req_id: 'first' }, body: { stream: { content: 'pong', finish: true } } })
    await bot.send('work', { id: 'owner', type: 'dm' }, 'notification')
    expect(frames.find(frame => frame.cmd === 'aibot_send_msg')).toMatchObject({ body: { chatid: 'owner', markdown: { content: 'notification' } } })
    await bot.stop()
    await bot.start()
    sendIncoming('second')
    await vi.waitFor(() => expect(frames.filter(frame => frame.cmd === 'aibot_respond_msg')).toHaveLength(2))
    expect(napcat).not.toHaveBeenCalled()
  })
})
