import type { QQBotClient } from 'qq-sdk/official'
import type { ReplyContext } from './types'
import { QQApiError } from 'qq-sdk/official'
import { describe, expect, it, vi } from 'vitest'
import { statusCard } from './cards'
import { ReplySender } from './reply'

function setup(format: 'markdown' | 'text' = 'markdown') {
  const qq = { reply: vi.fn<QQBotClient['reply']>(async () => ({})) }
  const onError = vi.fn()
  const sender = new ReplySender(qq, format, onError)
  const context: ReplyContext = { message: { id: 'message', content: '/status', author: { user_openid: 'owner' }, timestamp: new Date().toISOString() }, sequence: 0 }
  const card = statusCard('demo', undefined, [], 1, 'owner')!
  return { qq, sender, context, card, onError }
}

describe('qQ rich reply negotiation', () => {
  it('falls back through Markdown without keyboard to text using distinct sequences and caches the mode', async () => {
    const s = setup()
    s.qq.reply.mockRejectedValueOnce(new QQApiError(400, 40034029)).mockRejectedValueOnce(new QQApiError(403, 304061))
    expect(await s.sender.send(s.context, s.card)).toBe(true)
    expect(s.qq.reply.mock.calls.map(call => call[3])).toEqual([1, 2, 3])
    expect(s.qq.reply.mock.calls[0][2]).toEqual(s.card.payload)
    expect(s.qq.reply.mock.calls[1][2]).toEqual({ markdown: s.card.payload.markdown })
    expect(s.qq.reply.mock.calls[2][2]).toBe(s.card.text)
    expect(await s.sender.send({ ...s.context, sequence: 0, outbox: undefined }, s.card)).toBe(true)
    expect(s.qq.reply.mock.calls.at(-1)![2]).toBe(s.card.text)
    expect(s.onError).toHaveBeenCalledTimes(2)
  })

  it.each([
    new Error('Timeout after delivery may have succeeded'),
    new QQApiError(500, 40034029),
    new QQApiError(429, 40034100),
    new QQApiError(400, 40034006),
    new QQApiError(400, 40054005),
    new QQApiError(400, 123456),
  ])('never retries uncertain delivery, quotas, moderation or unknown errors: %s', async (error) => {
    const s = setup()
    s.qq.reply.mockRejectedValueOnce(error)
    expect(await s.sender.send(s.context, s.card)).toBe(false)
    expect(s.qq.reply).toHaveBeenCalledOnce()
    expect(await s.sender.send(s.context, s.card)).toBe(true)
    expect(s.qq.reply.mock.calls[1][2]).toEqual(s.card.payload)
  })

  it('serializes one reply window and respects its remaining attempt budget', async () => {
    const s = setup()
    let release!: (value: unknown) => void
    s.qq.reply.mockImplementationOnce(() => new Promise((resolve) => {
      release = resolve
    }))
    const first = s.sender.send(s.context, 'first')
    const second = s.sender.send(s.context, s.card)
    await vi.waitFor(() => expect(s.qq.reply).toHaveBeenCalledOnce())
    release({})
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(s.qq.reply.mock.calls.map(call => call[3])).toEqual([1, 2])
    s.context.sequence = 3
    s.qq.reply.mockRejectedValueOnce(new QQApiError(400, 40034029))
    expect(await s.sender.send(s.context, s.card)).toBe(false)
    expect(s.context.sequence).toBe(4)
    expect(await s.sender.send(s.context, 'exhausted')).toBe(false)
    expect(s.qq.reply).toHaveBeenCalledTimes(3)
  })

  it('honors text mode and refuses expired reply windows', async () => {
    const s = setup('text')
    expect(await s.sender.send(s.context, s.card)).toBe(true)
    expect(s.qq.reply.mock.calls[0][2]).toBe(s.card.text)
    s.context.message.timestamp = new Date(Date.now() - 61 * 60 * 1000).toISOString()
    expect(await s.sender.send(s.context, s.card)).toBe(false)
    expect(s.qq.reply).toHaveBeenCalledOnce()
  })
})
