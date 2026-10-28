import type { IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { WecomBridge } from './client'

interface RecordedRequest {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: string
}

const cleanup: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

function track(close: () => Promise<void> | void) {
  cleanup.push(close)
}

async function webhookServer() {
  const requests: RecordedRequest[] = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers,
      body,
    })
    const status = req.url === '/fail' ? 500 : 204
    res.writeHead(status)
    res.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  track(() => new Promise<void>(resolve => server.close(() => resolve())))
  const port = (server.address() as AddressInfo).port
  return {
    requests,
    url: `http://127.0.0.1:${port}/grok/wecom-inbound`,
    failUrl: `http://127.0.0.1:${port}/fail`,
  }
}

async function wecomSocket() {
  const sockets: import('ws').WebSocket[] = []
  const frames: unknown[] = []
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(wss, 'listening')
  track(() => new Promise<void>(resolve => wss.close(() => resolve())))
  wss.on('connection', (socket) => {
    sockets.push(socket)
    socket.on('error', () => {})
    socket.on('message', (data) => {
      frames.push(JSON.parse(data.toString()))
    })
  })
  const port = (wss.address() as AddressInfo).port
  return {
    frames,
    url: `ws://127.0.0.1:${port}`,
    async send(frame: unknown) {
      await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
      sockets[0]?.send(JSON.stringify(frame))
    },
  }
}

function textCallback(overrides: Record<string, unknown> = {}) {
  return {
    cmd: 'aibot_msg_callback',
    headers: { req_id: 'server-req' },
    body: {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'text',
      text: { content: 'hello' },
      ...overrides,
    },
  }
}

async function ackSubscribe(gateway: Awaited<ReturnType<typeof wecomSocket>>) {
  await vi.waitFor(() => {
    expect(gateway.frames.some(frame => isRecord(frame) && frame.cmd === 'aibot_subscribe')).toBe(true)
  })
  const subscribe = gateway.frames.find(frame => isRecord(frame) && frame.cmd === 'aibot_subscribe')
  if (!isRecord(subscribe) || !isRecord(subscribe.headers))
    throw new Error('missing subscribe frame')
  await gateway.send({
    headers: { req_id: subscribe.headers.req_id },
    errcode: 0,
    errmsg: 'ok',
  })
  return subscribe
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

describe('wecom bridge', () => {
  it('subscribes with bot credentials and posts the normalized text message', async () => {
    const http = await webhookServer()
    const gateway = await wecomSocket()
    const inbound: unknown[] = []
    const bridge = new WecomBridge({
      botId: 'your-bot-id',
      secret: 'super-secret-value',
      wsUrl: gateway.url,
      webhookUrl: http.url,
      webhookAuthHeader: 'Authorization',
      webhookAuthValue: 'Bearer REPLACE_WITH_ROUTINE_KEY',
      heartbeatIntervalMs: 60_000,
      maxReconnectAttempts: 0,
      webhookRetries: 0,
      onInbound: payload => inbound.push(payload),
    })
    track(() => bridge.stop())
    bridge.start()

    const subscribe = await ackSubscribe(gateway)
    expect(subscribe).toMatchObject({
      cmd: 'aibot_subscribe',
      body: { bot_id: 'your-bot-id', secret: 'super-secret-value' },
    })

    await gateway.send(textCallback())
    await vi.waitFor(() => expect(http.requests).toHaveLength(1))

    const expected = {
      source: 'wecom',
      text: 'hello',
      sender: { id: 'user-1' },
      chat: { type: 'dm' },
      msg: { id: 'msg-1' },
    }
    expect(http.requests[0]).toMatchObject({
      method: 'POST',
      url: '/grok/wecom-inbound',
      body: JSON.stringify(expected),
    })
    expect(http.requests[0]?.headers.authorization).toBe('Bearer REPLACE_WITH_ROUTINE_KEY')
    expect(http.requests[0]?.headers['content-type']).toBe('application/json')
    expect(http.requests[0]?.body).not.toContain('super-secret-value')
    expect(inbound).toEqual([expected])
  })

  it('posts group text with sender name and a custom auth header', async () => {
    const http = await webhookServer()
    const gateway = await wecomSocket()
    const bridge = new WecomBridge({
      botId: 'your-bot-id',
      secret: 'your-bot-secret',
      wsUrl: gateway.url,
      webhookUrl: http.url,
      webhookAuthHeader: 'X-Grok-Routine-Key',
      webhookAuthValue: 'REPLACE_WITH_ROUTINE_KEY',
      heartbeatIntervalMs: 60_000,
      maxReconnectAttempts: 0,
      webhookRetries: 0,
    })
    track(() => bridge.stop())
    bridge.start()
    await ackSubscribe(gateway)
    await gateway.send(textCallback({
      msgid: 'msg-2',
      chattype: 'group',
      chatid: 'chat-9',
      from: { userid: 'user-2', name: 'Ada' },
      text: { content: '@Bot hello' },
    }))
    await vi.waitFor(() => expect(http.requests).toHaveLength(1))
    expect(http.requests[0]?.headers['x-grok-routine-key']).toBe('REPLACE_WITH_ROUTINE_KEY')
    expect(JSON.parse(http.requests[0]?.body ?? '')).toEqual({
      source: 'wecom',
      text: '@Bot hello',
      sender: { id: 'user-2', name: 'Ada' },
      chat: { type: 'group', id: 'chat-9' },
      msg: { id: 'msg-2' },
    })
  })

  it('does not post image, voice, events, or a duplicate msgid', async () => {
    const http = await webhookServer()
    const gateway = await wecomSocket()
    const ignored: string[] = []
    const bridge = new WecomBridge({
      botId: 'your-bot-id',
      secret: 'your-bot-secret',
      wsUrl: gateway.url,
      webhookUrl: http.url,
      webhookAuthValue: 'Bearer REPLACE_WITH_ROUTINE_KEY',
      heartbeatIntervalMs: 60_000,
      maxReconnectAttempts: 0,
      webhookRetries: 0,
      onIgnored: message => ignored.push(`${message.msgtype}:${message.reason}`),
    })
    track(() => bridge.stop())
    bridge.start()
    await ackSubscribe(gateway)
    await gateway.send(textCallback())
    await gateway.send(textCallback())
    await gateway.send({
      cmd: 'aibot_msg_callback',
      headers: { req_id: 'img' },
      body: {
        msgid: 'img-1',
        chattype: 'single',
        from: { userid: 'user-1' },
        msgtype: 'image',
        image: { url: 'https://example.invalid/a.png', aeskey: 'key' },
      },
    })
    await gateway.send({
      cmd: 'aibot_msg_callback',
      headers: { req_id: 'voice' },
      body: {
        msgid: 'voice-1',
        chattype: 'single',
        from: { userid: 'user-1' },
        msgtype: 'voice',
        voice: { content: 'transcribed but ignored' },
      },
    })
    await gateway.send({
      cmd: 'aibot_event_callback',
      headers: { req_id: 'event' },
      body: {
        msgid: 'evt-1',
        msgtype: 'event',
        from: { userid: 'user-1' },
        event: { eventtype: 'enter_chat' },
      },
    })
    await vi.waitFor(() => {
      expect(ignored).toEqual([
        'image:unsupported-type',
        'voice:unsupported-type',
      ])
      expect(http.requests).toHaveLength(1)
    })
    expect(http.requests[0]?.body).toContain('"text":"hello"')
  })

  it('reports a failed webhook without a live WeCom call', async () => {
    const http = await webhookServer()
    const gateway = await wecomSocket()
    const errors: string[] = []
    const bridge = new WecomBridge({
      botId: 'your-bot-id',
      secret: 'your-bot-secret',
      wsUrl: gateway.url,
      webhookUrl: http.failUrl,
      webhookAuthValue: 'Bearer REPLACE_WITH_ROUTINE_KEY',
      heartbeatIntervalMs: 60_000,
      maxReconnectAttempts: 0,
      webhookRetries: 0,
      onError: error => errors.push(error.message),
    })
    track(() => bridge.stop())
    bridge.start()
    await ackSubscribe(gateway)
    await gateway.send(textCallback({ msgid: 'msg-fail' }))
    await vi.waitFor(() => expect(errors).toContain('Failed to forward msg-fail: Grok webhook responded 500'))
    expect(http.requests[0]?.method).toBe('POST')
  })

  it('sends ping heartbeats after subscribe', async () => {
    const http = await webhookServer()
    const gateway = await wecomSocket()
    const bridge = new WecomBridge({
      botId: 'your-bot-id',
      secret: 'your-bot-secret',
      wsUrl: gateway.url,
      webhookUrl: http.url,
      webhookAuthValue: 'Bearer REPLACE_WITH_ROUTINE_KEY',
      heartbeatIntervalMs: 30,
      maxReconnectAttempts: 0,
      webhookRetries: 0,
    })
    track(() => bridge.stop())
    bridge.start()
    await ackSubscribe(gateway)
    await vi.waitFor(() => {
      expect(gateway.frames.some(frame => isRecord(frame) && frame.cmd === 'ping')).toBe(true)
    })
    expect(http.requests).toHaveLength(0)
  })
})
