import type { ReplyContext } from './types'
import { Buffer } from 'node:buffer'
import { QQBotClient } from 'qq-sdk/official'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { statusCard } from './cards'
import { CardImageUploader } from './image-upload'
import { ReplySender } from './reply'

afterEach(() => vi.unstubAllGlobals())

describe('uploaded image cards', () => {
  it('renders a real PNG and sends native media followed by copyable controls within the passive budget', async () => {
    let size = 0
    let transferred: Uint8Array | undefined
    const sent: Record<string, unknown>[] = []
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/token'))
        return Response.json({ access_token: 'token', expires_in: 3600 })
      if (init?.method === 'PUT') {
        transferred = init.body as Uint8Array
        return new Response(null)
      }
      const body = JSON.parse(String(init?.body))
      if (url.endsWith('/upload_prepare')) {
        size = Number(body.file_size)
        return Response.json({ upload_id: 'upload', block_size: '5242880', parts: [{ index: 0, block_size: String(size), presigned_url: 'https://storage.example/upload?signed=yes' }] })
      }
      if (url.endsWith('/files')) {
        expect(body.srv_send_msg).toBe(false)
        return Response.json({ file_info: 'opaque-info', raw_url: 'https://storage.example/card.png?signed=yes', ttl: 300 })
      }
      if (url.endsWith('/messages'))
        sent.push(body)
      return Response.json({})
    })
    vi.stubGlobal('fetch', fetcher)
    const qq = new QQBotClient({ appId: 'app', secret: 'secret', apiBase: 'https://api.example', tokenUrl: 'https://api.example/token' })
    const onError = vi.fn()
    const sender = new ReplySender(qq, 'image', onError, new CardImageUploader(qq, { theme: 'dark', transport: 'upload' }))
    const context: ReplyContext = { message: { id: 'incoming', author: { user_openid: 'owner' }, content: '/status', timestamp: new Date().toISOString() }, sequence: 0 }
    const card = statusCard('demo', undefined, [], 1, 'owner')!
    expect(await sender.send(context, card)).toBe(true)
    expect(transferred?.length).toBe(size)
    expect(Buffer.from(transferred!).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(sent).toEqual([
      { msg_type: 7, media: { file_info: 'opaque-info' }, msg_id: 'incoming', msg_seq: 1 },
      { msg_type: 2, markdown: { content: expect.stringContaining('&#47;status') }, keyboard: card.payload.keyboard, msg_id: 'incoming', msg_seq: 2 },
    ])
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/messages'))).toHaveLength(2)
    expect(JSON.stringify(sent)).not.toContain('signed=yes')
    expect(onError).not.toHaveBeenCalled()
  }, 15000) // Include native font discovery in the real rendering/upload check.

  it('displays native media even when the server omits its Markdown URL', async () => {
    const qq = { uploadImage: vi.fn(async () => ({ file_info: 'private-info', ttl: 300 })), reply: vi.fn<QQBotClient['reply']>(async () => ({})) }
    const onError = vi.fn()
    const sender = new ReplySender(qq, 'image', onError, new CardImageUploader(qq, { theme: 'light' }))
    const context: ReplyContext = { message: { id: 'incoming', author: { user_openid: 'owner' }, content: '/status', timestamp: new Date().toISOString() }, sequence: 0 }
    const card = statusCard('demo', undefined, [], 1, 'owner')!
    expect(await sender.send(context, card)).toBe(true)
    expect(qq.reply.mock.calls[0]).toEqual(['owner', 'incoming', { media: { file_info: 'private-info' } }, 1])
    expect(qq.reply.mock.calls[1][2]).toHaveProperty('keyboard', card.payload.keyboard)
    expect(onError).not.toHaveBeenCalled()
  })
})
