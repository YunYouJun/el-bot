import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { GrokWebhookResponder } from '@el-bot/plugin-grok'
import { serve } from '@hono/node-server'
import { describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'
import { startWecomGrok } from './runtime'

describe('weCom SDK → official Grok webhook → callback → SDK reply', () => {
  it('delivers the actual returned answer with the original WeCom request identity', async () => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await once(wss, 'listening')
    const frames: Record<string, any>[] = []
    let push!: (frame: unknown) => void
    wss.on('connection', (socket) => {
      push = frame => socket.send(JSON.stringify(frame))
      socket.on('message', (data) => {
        const frame = JSON.parse(data.toString())
        frames.push(frame)
        socket.send(JSON.stringify({ headers: frame.headers, errcode: 0, errmsg: 'ok' }))
      })
    })
    const webhookRequests: Record<string, any>[] = []
    let callbackPort = 0
    const responder = new GrokWebhookResponder({
      webhookUrl: 'https://grok.example/routine',
      authValue: 'Bearer fake-key',
      callbackUrl: 'https://reply.example/grok/reply',
      fetchImpl: async (_url, init) => {
        const payload = JSON.parse(String(init?.body))
        webhookRequests.push(payload)
        const result = await fetch(`http://127.0.0.1:${callbackPort}/grok/reply`, {
          method: 'POST',
          headers: { authorization: payload.reply.authorization },
          body: JSON.stringify({ requestId: payload.requestId, answer: '2 + 3 = 5。' }),
        })
        expect(result.status).toBe(204)
        return new Response(null, { status: 200 })
      },
    })
    const callbackServer = serve({ fetch: req => responder.handleRequest(req), hostname: '127.0.0.1', port: 0 })
    await once(callbackServer, 'listening')
    callbackPort = (callbackServer.address() as AddressInfo).port
    const events: string[] = []
    let app: Awaited<ReturnType<typeof startWecomGrok>> | undefined
    try {
      app = await startWecomGrok({
        wecom: { botType: 'smart', botId: 'fake-bot', secret: 'fake-secret', wsUrl: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`, heartbeatIntervalMs: 30_000, webhookAuthHeader: 'Authorization' },
        binding: { wecomBotId: 'fake-bot', ownerUserId: 'owner' },
        responder,
        onEvent: event => events.push(event),
      })
      push({ cmd: 'aibot_msg_callback', headers: { req_id: 'original-req' }, body: { msgid: 'msg-1', aibotid: 'fake-bot', chattype: 'single', from: { userid: 'owner' }, msgtype: 'text', text: { content: '2 + 3?' } } })
      await vi.waitFor(() => expect(events).toContain('replied'))
      expect(events).toEqual(['ready', 'received', 'answered', 'replied'])
      expect(webhookRequests).toHaveLength(1)
      expect(webhookRequests[0]?.text).toBe('2 + 3?')
      expect(webhookRequests[0]).not.toHaveProperty('sender')
      const reply = frames.find(frame => frame.cmd === 'aibot_respond_msg')
      expect(reply).toMatchObject({ headers: { req_id: 'original-req' }, body: { msgtype: 'stream', stream: { content: '2 + 3 = 5。', finish: true } } })
    }
    finally {
      await app?.stop()
      await new Promise<void>(resolve => callbackServer.close(() => resolve()))
      await new Promise<void>(resolve => wss.close(() => resolve()))
    }
  })
})
