import type { RequestListener } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { QQMarkdownReply } from './types'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { createServer } from 'node:http'
import nacl from 'tweetnacl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { generateSeed } from '../validation'
import { QQApiError, QQBotClient } from './client'
import { parseC2CMessage, QQGateway } from './gateway'
import { createQQWebhookHandler } from './webhook'

const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function api(handler: RequestListener) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanup.push(
    () => new Promise<void>(resolve => server.close(() => resolve())),
  )
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    server,
    base,
    client: new QQBotClient({
      appId: 'app',
      secret: 'secret',
      apiBase: base,
      tokenUrl: `${base}/token`,
    }),
  }
}

function event() {
  return {
    op: 0,
    t: 'C2C_MESSAGE_CREATE',
    s: 2,
    d: {
      id: 'message',
      author: { user_openid: 'owner' },
      content: 'hello',
      timestamp: new Date().toISOString(),
    },
  }
}

describe('official QQ REST and gateway', () => {
  it('sends Markdown and C2C command buttons without mutually exclusive text fields', async () => {
    let received: unknown
    const { client } = await api(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      if (req.url === '/token') {
        res.end(JSON.stringify({ access_token: 'token', expires_in: 7200 }))
        return
      }
      received = JSON.parse(body)
      res.end(JSON.stringify({ id: 'card' }))
    })
    const payload: QQMarkdownReply = {
      markdown: { content: '# 任务状态\n\n已完成' },
      keyboard: { content: { rows: [{ buttons: [{ id: 'status', render_data: { label: '刷新状态', style: 1 }, action: { type: 2, data: '/status', enter: true, permission: { type: 2 } } }] }] } },
    }
    await client.reply('owner', 'message', payload, 2)
    expect(received).toEqual({ msg_type: 2, markdown: payload.markdown, keyboard: payload.keyboard, msg_id: 'message', msg_seq: 2 })
    expect(received).not.toHaveProperty('content')
    expect(received).not.toHaveProperty('ark')
    await client.reply('owner', 'message', { markdown: payload.markdown }, 3)
    expect(received).not.toHaveProperty('keyboard')
  })

  it('coalesces token refresh and sends authenticated, encoded C2C replies', async () => {
    let tokens = 0
    const calls: { url: string, auth?: string, body: unknown }[] = []
    const { client } = await api(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      if (req.url === '/token') {
        tokens++
        expect(JSON.parse(body)).toEqual({
          appId: 'app',
          clientSecret: 'secret',
        })
        res.end(
          JSON.stringify({
            access_token: `token-${tokens}`,
            expires_in: '7200',
          }),
        )
      }
      else {
        calls.push({
          url: req.url!,
          auth: req.headers.authorization,
          body: JSON.parse(body),
        })
        res.end(JSON.stringify({ id: 'reply' }))
      }
    })
    await Promise.all([
      client.reply('a/b', 'm', '你好', 1),
      client.reply('a/b', 'm', '第二条', 2),
    ])
    expect(tokens).toBe(1)
    expect(calls[0]).toEqual({
      url: '/v2/users/a%2Fb/messages',
      auth: 'QQBot token-1',
      body: { content: '你好', msg_type: 0, msg_id: 'm', msg_seq: 1 },
    })
    expect(calls[1].body).toMatchObject({ msg_seq: 2 })
  })

  it('refreshes on 401, but does not blindly retry rate limits or leak response bodies', async () => {
    let tokens = 0
    let requests = 0
    const { client } = await api((req, res) => {
      if (req.url === '/token') {
        res.end(
          JSON.stringify({ access_token: `t${++tokens}`, expires_in: 7200 }),
        )
        return
      }
      requests++
      res.statusCode = requests === 1 ? 401 : 429
      res.end(JSON.stringify({ code: 40034100, message: 'secret response' }))
    })
    await expect(client.reply('owner', 'id', 'text', 1)).rejects.toEqual(
      new QQApiError(429, 40034100),
    )
    expect(tokens).toBe(2)
    expect(requests).toBe(2)
  })

  it('reports an actionable gateway allowlist error without leaking the response body', async () => {
    const { client } = await api((req, res) => {
      if (req.url === '/token') {
        res.end(JSON.stringify({ access_token: 'token', expires_in: 7200 }))
        return
      }
      res.statusCode = 401
      res.end(JSON.stringify({ code: 11298, message: 'private response details' }))
    })
    const onError = vi.fn()
    const onReady = vi.fn()
    const gateway = new QQGateway(client, {
      onMessage: vi.fn(),
      onError,
      onReady,
    })
    cleanup.push(() => gateway.stop())
    await gateway.start()
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0]).toBeInstanceOf(QQApiError)
    expect(onError.mock.calls[0][0].message).toContain('11298')
    expect(onError.mock.calls[0][0].message).toContain('allowlist')
    expect(onError.mock.calls[0][0].message).not.toContain('private response details')
  })

  it('identifies, heartbeats, resumes, and dispatches only valid private text messages', async () => {
    let gatewayUrl = ''
    const { server, client } = await api((req, res) => {
      res.end(
        JSON.stringify(
          req.url === '/token'
            ? { access_token: 't', expires_in: 7200 }
            : { url: gatewayUrl },
        ),
      )
    })
    const ws = new WebSocketServer({ server })
    gatewayUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`
    const received: Record<string, any>[] = []
    let connections = 0
    ws.on('connection', (socket) => {
      connections++
      socket.send(JSON.stringify({ op: 10, d: { heartbeat_interval: 30 } }))
      socket.on('message', (raw) => {
        const payload = JSON.parse(raw.toString())
        received.push(payload)
        if (payload.op === 2) {
          socket.send(
            JSON.stringify({
              op: 0,
              t: 'READY',
              s: 1,
              d: { session_id: 'session' },
            }),
          )
          socket.send(
            JSON.stringify({ ...event(), t: 'GROUP_AT_MESSAGE_CREATE' }),
          )
          socket.send(JSON.stringify(event()))
        }
        if (payload.op === 1)
          socket.send(JSON.stringify({ op: 11 }))
        if (payload.op === 6)
          socket.send(JSON.stringify({ op: 0, t: 'RESUMED', s: 3, d: {} }))
      })
    })
    cleanup.push(() => {
      for (const socket of ws.clients) socket.terminate()
      ws.close()
    })
    const message = vi.fn(async () => {})
    const gateway = new QQGateway(client, {
      onMessage: message,
      onError: vi.fn(),
      reconnectMs: 10,
    })
    cleanup.push(() => gateway.stop())
    await gateway.start()
    await vi.waitFor(() => expect(message).toHaveBeenCalledTimes(1))
    await vi.waitFor(() =>
      expect(received.some(p => p.op === 1 && p.d === 2)).toBe(true),
    )
    expect(received[0]).toMatchObject({
      op: 2,
      d: { token: 'QQBot t', intents: 1 << 25 },
    })
    for (const socket of ws.clients) socket.send(JSON.stringify({ op: 7 }))
    await vi.waitFor(() => expect(received.some(p => p.op === 6)).toBe(true))
    expect(received.find(p => p.op === 6)).toMatchObject({
      d: { session_id: 'session', seq: 2 },
    })
    expect(connections).toBe(2)
  })

  it('rejects missing identities and card contents', () => {
    expect(parseC2CMessage({ ...event(), t: 'AT_MESSAGE_CREATE', d: { ...event().d, author: { id: 'owner' }, channel_id: 'channel', guild_id: 'guild' } })).toBeUndefined()
    expect(parseC2CMessage({ ...event(), t: 'DIRECT_MESSAGE_CREATE' })).toBeUndefined()
    expect(
      parseC2CMessage({ ...event(), d: { ...event().d, author: {} } }),
    ).toBeUndefined()
    expect(
      parseC2CMessage({ ...event(), d: { ...event().d, message_type: 3 } }),
    ).toBeUndefined()
    expect(() => generateSeed('')).toThrow('secret')
  })
})

describe('signed QQ webhook', () => {
  const secret = 'DG5g3B4j9X2KOErG'
  function request(
    body: string,
    timestamp = String(Math.floor(Date.now() / 1000)),
  ) {
    const keys = nacl.sign.keyPair.fromSeed(generateSeed(secret))
    const signature = Buffer.from(
      nacl.sign.detached(Buffer.from(timestamp + body), keys.secretKey),
    ).toString('hex')
    return new Request('http://localhost/qq/events', {
      method: 'POST',
      body,
      headers: {
        'x-bot-appid': 'app',
        'x-signature-timestamp': timestamp,
        'x-signature-ed25519': signature,
      },
    })
  }

  it('validates the official challenge vector and acknowledges private messages', async () => {
    const onMessage = vi.fn(async () => {})
    const handler = createQQWebhookHandler({ appId: 'app', secret, onMessage })
    const body = JSON.stringify({
      op: 13,
      d: { plain_token: 'Arq0D5A61EgUu4OxUvOp', event_ts: '1725442341' },
    })
    expect(await (await handler(request(body))).json()).toEqual({
      plain_token: 'Arq0D5A61EgUu4OxUvOp',
      signature:
        '87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706',
    })
    expect(
      await (await handler(request(JSON.stringify(event())))).json(),
    ).toEqual({ op: 12 })
    expect(onMessage).toHaveBeenCalledOnce()
  })

  it('rejects tampering, wrong app IDs and replayed timestamps before dispatch', async () => {
    const onMessage = vi.fn(async () => {})
    const handler = createQQWebhookHandler({ appId: 'app', secret, onMessage })
    const original = request(JSON.stringify(event()))
    const tampered = new Request(original.url, {
      method: 'POST',
      headers: original.headers,
      body: '{}',
    })
    expect((await handler(tampered)).status).toBe(401)
    const wrong = request(JSON.stringify(event()))
    wrong.headers.set('x-bot-appid', 'other')
    expect((await handler(wrong)).status).toBe(401)
    expect(
      (await handler(request(JSON.stringify(event()), '1725442341'))).status,
    ).toBe(401)
    expect(onMessage).not.toHaveBeenCalled()
  })
})
