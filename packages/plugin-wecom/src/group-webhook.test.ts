import { describe, expect, it, vi } from 'vitest'
import { sendWecomGroupWebhook } from './group-webhook'

describe('sendWecomGroupWebhook', () => {
  it.each([
    { msgtype: 'text' as const, text: { content: 'hello' } },
    { msgtype: 'markdown' as const, markdown: { content: '**hello**' } },
  ])('sends a $msgtype group notification without bot credentials', async (message) => {
    const fetchImpl = vi.fn(async () => Response.json({ errcode: 0, errmsg: 'ok' }))
    await sendWecomGroupWebhook({ url: 'https://example.invalid/send?key=placeholder', message, fetchImpl })
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith('https://example.invalid/send?key=placeholder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
      redirect: 'error',
      signal: expect.any(AbortSignal),
    })
  })

  it.each([
    { response: () => new Response('private-response', { status: 403 }), expected: 'WeCom group webhook responded 403' },
    { response: () => Response.json({ errcode: 93000, errmsg: 'private-response' }), expected: 'WeCom group webhook failed: 93000' },
    { response: () => new Response('private-response'), expected: 'WeCom group webhook returned an invalid response' },
    { response: () => Response.json({ errmsg: 'private-response' }), expected: 'WeCom group webhook returned an invalid response' },
  ])('reports failures without leaking the URL key or response body', async ({ response, expected }) => {
    const error = await sendWecomGroupWebhook({
      url: 'https://example.invalid/send?key=private-key',
      message: { msgtype: 'text', text: { content: 'hello' } },
      fetchImpl: vi.fn(async () => response()),
    }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ message: expected })
    expect(String(error)).not.toMatch(/private-key|private-response/)
  })

  it('redacts transport errors that contain the webhook URL', async () => {
    await expect(sendWecomGroupWebhook({
      url: 'https://example.invalid/send?key=private-key',
      message: { msgtype: 'text', text: { content: 'hello' } },
      fetchImpl: vi.fn(async () => { throw new Error('request to ?key=private-key failed') }),
    })).rejects.toThrow('WeCom group webhook request failed')
  })
})
