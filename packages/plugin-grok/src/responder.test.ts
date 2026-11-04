import { describe, expect, it, vi } from 'vitest'
import { GrokWebhookResponder } from './responder'

interface CallbackPayload {
  requestId: string
  text: string
  reply: { url: string, authorization: string }
}

function fixture(options: { timeoutMs?: number, status?: number, loopback?: boolean } = {}) {
  let payload!: CallbackPayload
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    payload = JSON.parse(String(init?.body))
    return new Response(null, { status: options.status ?? 200 })
  })
  const responder = new GrokWebhookResponder({
    webhookUrl: 'https://grok.example/routine',
    authValue: 'Bearer fake-key',
    callbackUrl: options.loopback ? 'http://127.0.0.1:8789/grok/reply' : 'https://reply.example/grok/reply',
    callbackMode: options.loopback ? 'loopback' : 'https',
    fetchImpl,
    timeoutMs: options.timeoutMs,
  })
  return {
    responder,
    fetchImpl,
    payload: () => payload,
    callback(answer = '答案是 5。', overrides: { requestId?: string, authorization?: string } = {}) {
      return responder.handleRequest(new Request(payload.reply.url, {
        method: 'POST',
        headers: { authorization: overrides.authorization ?? payload.reply.authorization },
        body: JSON.stringify({ requestId: overrides.requestId ?? payload.requestId, answer }),
      }))
    },
  }
}

describe('official Grok webhook and asynchronous callback', () => {
  it('keeps one-use authentication when the routine runs on the same computer', async () => {
    const f = fixture({ loopback: true })
    const answer = f.responder.ask('hello')
    expect(f.payload().reply.url).toBe('http://127.0.0.1:8789/grok/reply')
    expect((await f.callback('wrong', { authorization: 'Bearer invalid' })).status).toBe(401)
    expect((await f.callback('same-computer answer')).status).toBe(204)
    await expect(answer).resolves.toBe('same-computer answer')
    expect((await f.callback()).status).toBe(401)
  })

  it.each(['http://localhost:8789/reply', 'http://0.0.0.0:8789/reply', 'http://10.0.0.1:8789/reply', 'https://reply.example/reply'])(
    'rejects a non-loopback callback in loopback mode: %s',
    (callbackUrl) => {
      expect(() => new GrokWebhookResponder({
        webhookUrl: 'https://grok.example/routine',
        authValue: 'Bearer fake-key',
        callbackUrl,
        callbackMode: 'loopback',
      })).toThrow('HTTP on 127.0.0.1')
    },
  )

  it('requires explicit loopback mode before allowing an HTTP callback', () => {
    expect(() => new GrokWebhookResponder({
      webhookUrl: 'https://grok.example/routine',
      authValue: 'Bearer fake-key',
      callbackUrl: 'http://127.0.0.1:8789/reply',
    })).toThrow('HTTPS')
  })

  it('waits for the authenticated result rather than treating HTTP 200 as the answer', async () => {
    const f = fixture()
    const completed = vi.fn()
    const answer = f.responder.ask('2 + 3?').then((value) => {
      completed(value)
      return value
    })
    await vi.waitFor(() => expect(f.fetchImpl).toHaveBeenCalledTimes(1))
    expect(completed).not.toHaveBeenCalled()
    expect(f.payload().text).toBe('2 + 3?')
    expect(f.fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer fake-key' })
    expect((await f.callback()).status).toBe(204)
    await expect(answer).resolves.toBe('答案是 5。')
    expect((await f.callback()).status).toBe(401)
  })

  it('rejects the wrong token or request without consuming the valid reply', async () => {
    const f = fixture()
    const answer = f.responder.ask('hello')
    expect((await f.callback('private wrong answer', { authorization: `Bearer ${'0'.repeat(64)}` })).status).toBe(401)
    expect((await f.callback('private wrong answer', { requestId: 'another' })).status).toBe(400)
    await f.callback('correct')
    await expect(answer).resolves.toBe('correct')
  })

  it('expires the callback and does not retry an unanswered trigger', async () => {
    const f = fixture({ timeoutMs: 20 })
    await expect(f.responder.ask('hello')).rejects.toMatchObject({ code: 'GROK_TIMEOUT' })
    expect((await f.callback()).status).toBe(401)
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reports a rejected webhook without exposing its response body', async () => {
    const f = fixture({ status: 500 })
    await expect(f.responder.ask('hello')).rejects.toMatchObject({ code: 'GROK_WEBHOOK_REJECTED' })
  })

  it('does not start a run after cancellation', async () => {
    const f = fixture()
    await expect(f.responder.ask('hello', AbortSignal.abort())).rejects.toMatchObject({ code: 'GROK_CANCELLED' })
    expect(f.fetchImpl).not.toHaveBeenCalled()
  })

  it('bounds callback bodies before parsing and keeps the request available', async () => {
    const f = fixture()
    const answer = f.responder.ask('hello')
    expect((await f.callback('x'.repeat(70_000))).status).toBe(413)
    await f.callback('short')
    await expect(answer).resolves.toBe('short')
  })
})
