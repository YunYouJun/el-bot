import type { QQBotClient } from 'qq-sdk/official'
import type { RemoteConfig, ReplyContext } from './types'
import { QQApiError } from 'qq-sdk/official'
import { describe, expect, it, vi } from 'vitest'
import { statusCard } from './cards'
import { ReplySender } from './reply'

function setup(format: RemoteConfig['messageFormat'] = 'markdown') {
  const qq = { reply: vi.fn<QQBotClient['reply']>(async () => ({})) }
  const onError = vi.fn()
  const images = { publish: vi.fn(async () => ({ url: 'https://bot.example/qq-codex/images/test.png', width: 720, height: 800 })) }
  const sender = new ReplySender(qq, format, onError, images)
  const context: ReplyContext = { message: { id: 'message', content: '/status', author: { user_openid: 'owner' }, timestamp: new Date().toISOString() }, sequence: 0 }
  const card = statusCard('demo', undefined, [], 1, 'owner')!
  return { qq, sender, context, card, onError, images }
}

describe('qQ rich reply negotiation', () => {
  it('reserves space for native media controls and uses selectable Markdown when only one attempt remains', async () => {
    const s = setup('image')
    const images = { kind: 'media' as const, publish: vi.fn(async () => ({ media: { file_info: 'file' }, width: 720, height: 800 })) }
    const sender = new ReplySender(s.qq, 'image', s.onError, images)
    expect(await sender.send(s.context, s.card)).toBe(true)
    expect(s.qq.reply.mock.calls.map(call => call[3])).toEqual([1, 2])
    expect(s.qq.reply.mock.calls[0][2]).toEqual({ media: { file_info: 'file' } })
    expect(s.qq.reply.mock.calls[1][2]).toHaveProperty('keyboard', s.card.payload.keyboard)
    s.context.sequence = 3
    expect(await sender.send(s.context, s.card)).toBe(true)
    expect(images.publish).toHaveBeenCalledOnce()
    expect(s.qq.reply.mock.calls[2]).toEqual(['owner', 'message', s.card.payload, 4])
    expect(await sender.send(s.context, 'over budget')).toBe(false)
  })

  it('does not replay native media or send controls after uncertain media delivery', async () => {
    const s = setup('image')
    const images = { kind: 'media' as const, publish: vi.fn(async () => ({ media: { file_info: 'file' }, width: 720, height: 800 })) }
    const sender = new ReplySender(s.qq, 'image', s.onError, images)
    s.qq.reply.mockRejectedValueOnce(new Error('Timeout after media delivery may have succeeded'))
    expect(await sender.send(s.context, s.card)).toBe(false)
    expect(s.qq.reply).toHaveBeenCalledOnce()
    expect(s.context.sequence).toBe(1)
  })

  it('does not send media or controls if the reply window expires during upload', async () => {
    const s = setup('image')
    const images = { kind: 'media' as const, publish: vi.fn(async () => {
      s.context.message.timestamp = new Date(Date.now() - 61 * 60 * 1000).toISOString()
      return { media: { file_info: 'file' }, width: 720, height: 800 }
    }) }
    expect(await new ReplySender(s.qq, 'image', s.onError, images).send(s.context, s.card)).toBe(false)
    expect(s.qq.reply).not.toHaveBeenCalled()
  })
  it.each([40034004, 40034141])('falls back to selectable Markdown after a verified image transfer rejection: %s', async (code) => {
    const s = setup('image')
    s.qq.reply.mockRejectedValueOnce(new QQApiError(400, code))
    expect(await s.sender.send(s.context, s.card)).toBe(true)
    expect(s.qq.reply.mock.calls.map(call => call[3])).toEqual([1, 2])
    expect(s.qq.reply.mock.calls[1][2]).toEqual(s.card.payload)
    expect(s.images.publish).toHaveBeenCalledOnce()
  })
  it('falls back after a definite invalid media response and never repeats the upload', async () => {
    const s = setup('image')
    const images = { kind: 'media' as const, publish: vi.fn(async () => ({ media: { file_info: 'file' }, width: 720, height: 800 })) }
    s.qq.reply.mockRejectedValueOnce(new QQApiError(400, 304080))
    expect(await new ReplySender(s.qq, 'image', s.onError, images).send(s.context, s.card)).toBe(true)
    expect(s.qq.reply.mock.calls[1][2]).toEqual(s.card.payload)
    expect(images.publish).toHaveBeenCalledOnce()
  })
  it('embeds a rendered image and retains the C2C keyboard in a single reply', async () => {
    const s = setup('image')
    expect(await s.sender.send(s.context, s.card)).toBe(true)
    expect(s.images.publish).toHaveBeenCalledExactlyOnceWith(s.card, 'owner')
    expect(s.qq.reply).toHaveBeenCalledOnce()
    expect(s.qq.reply.mock.calls[0][2]).toMatchObject({ markdown: { content: expect.stringContaining('![卡片 #720px #800px](https://bot.example/qq-codex/images/test.png)'), force_verify_image_resource: true }, keyboard: s.card.payload.keyboard })
    expect(s.context.sequence).toBe(1)
    const approval = { ...s.card, imageAllowed: false }
    expect(await s.sender.send(s.context, approval)).toBe(true)
    expect(s.images.publish).toHaveBeenCalledOnce()
    expect(s.qq.reply.mock.calls[1][2]).toEqual(s.card.payload)
  })

  it('falls back without replaying uncertain image delivery and uses at most four attempts', async () => {
    const s = setup('image')
    s.qq.reply.mockRejectedValueOnce(new QQApiError(400, 40034029)).mockRejectedValueOnce(new QQApiError(400, 40034029)).mockRejectedValueOnce(new QQApiError(400, 40034029))
    expect(await s.sender.send(s.context, s.card)).toBe(true)
    expect(s.qq.reply.mock.calls.map(call => call[3])).toEqual([1, 2, 3, 4])
    expect(s.images.publish).toHaveBeenCalledOnce()
    expect(s.qq.reply.mock.calls[1][2]).not.toHaveProperty('keyboard')
    expect(s.qq.reply.mock.calls[2][2]).toEqual({ markdown: s.card.payload.markdown })
    expect(s.qq.reply.mock.calls[3][2]).toBe(s.card.text)
    const uncertain = setup('image')
    uncertain.qq.reply.mockRejectedValueOnce(new Error('Timeout'))
    expect(await uncertain.sender.send(uncertain.context, uncertain.card)).toBe(false)
    expect(uncertain.qq.reply).toHaveBeenCalledOnce()
  })

  it('falls back before sending when local rendering fails and does not render expired windows', async () => {
    const s = setup('image')
    s.images.publish.mockRejectedValueOnce(new Error('Native rendering unavailable'))
    expect(await s.sender.send(s.context, s.card)).toBe(true)
    expect(s.qq.reply.mock.calls[0][2]).toEqual(s.card.payload)
    expect(s.context.sequence).toBe(1)
    const expired = setup('image')
    expired.context.message.timestamp = new Date(Date.now() - 61 * 60 * 1000).toISOString()
    expect(await expired.sender.send(expired.context, expired.card)).toBe(false)
    expect(expired.images.publish).not.toHaveBeenCalled()
  })
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
