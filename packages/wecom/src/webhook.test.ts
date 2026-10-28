import type { IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { WecomInboundPayload } from './types'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { postWecomWebhook } from './webhook'

const payload: WecomInboundPayload = {
  source: 'wecom',
  text: 'hello',
  sender: { id: 'user-1', name: 'Ada' },
  chat: { type: 'dm' },
  msg: { id: 'msg-1' },
}

const body = JSON.stringify(payload)
const cleanup: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function recordServer() {
  const requests: { method: string, url: string, headers: IncomingMessage['headers'], body: string }[] = []
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers,
      body: raw,
    })
    const status = req.url === '/fail' ? 500 : 204
    res.writeHead(status)
    res.end(status === 500 ? 'secret-from-body' : '')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanup.push(() => new Promise<void>(resolve => server.close(() => resolve())))
  const port = (server.address() as AddressInfo).port
  return {
    requests,
    url: `http://127.0.0.1:${port}/grok/wecom-inbound`,
    failUrl: `http://127.0.0.1:${port}/fail`,
  }
}

describe('postWecomWebhook', () => {
  it('posts the exact method, url, headers, and JSON body', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    await postWecomWebhook({
      url: 'https://example.invalid/grok/routines/wecom-inbound',
      payload,
      authHeader: 'Authorization',
      authValue: 'Bearer REPLACE_WITH_ROUTINE_KEY',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('https://example.invalid/grok/routines/wecom-inbound', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer REPLACE_WITH_ROUTINE_KEY',
      },
      body,
      redirect: 'error',
      signal: expect.any(AbortSignal),
    })
  })

  it('sends a configurable auth header on the wire', async () => {
    const { requests, url } = await recordServer()
    await postWecomWebhook({
      url,
      payload,
      authHeader: 'X-Grok-Routine-Key',
      authValue: 'REPLACE_WITH_ROUTINE_KEY',
    })

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: '/grok/wecom-inbound',
      body,
    })
    expect(requests[0]?.headers['x-grok-routine-key']).toBe('REPLACE_WITH_ROUTINE_KEY')
    expect(requests[0]?.headers['content-type']).toBe('application/json')
    expect(JSON.parse(requests[0]?.body ?? '')).toEqual(payload)
  })

  it('reports the status code without copying the response body', async () => {
    const { failUrl } = await recordServer()
    const error = await postWecomWebhook({
      url: failUrl,
      payload,
      authHeader: 'Authorization',
      authValue: 'Bearer REPLACE_WITH_ROUTINE_KEY',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ message: 'Grok webhook responded 500' })
    expect(error instanceof Error ? error.message : '').not.toContain('secret-from-body')
  })
})
