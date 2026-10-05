import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QQApiError, QQBotClient } from './client'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBn0AAAAASUVORK5CYII=', 'base64')
const digest = (algorithm: string, bytes: Uint8Array) => createHash(algorithm).update(bytes).digest('hex')
const json = (data: unknown) => Response.json(data)
afterEach(() => vi.unstubAllGlobals())

function setup(prepared: unknown = { upload_id: 'upload', block_size: '40', parts: [{ index: 1, block_size: String(png.length - 40), presigned_url: 'https://storage.example/part-1?sign=secret' }, { index: 0, block_size: '40', presigned_url: 'https://storage.example/part-0?sign=secret' }] }) {
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input)
    if (url.endsWith('/token'))
      return json({ access_token: 'private-token', expires_in: 3600 })
    if (url.endsWith('/upload_prepare'))
      return json(prepared)
    if (init?.method === 'PUT')
      return new Response(null, { status: 200 })
    if (url.endsWith('/files'))
      return json({ file_info: 'opaque-file-info', ttl: 300, raw_url: 'https://storage.example/image(1).png?sign=secret' })
    return json({})
  })
  vi.stubGlobal('fetch', fetcher)
  const qq = new QQBotClient({ appId: 'app', secret: 'secret', apiBase: 'https://api.example', tokenUrl: 'https://api.example/token' })
  return { qq, fetcher }
}

describe('local C2C image uploads', () => {
  it('accepts the one-based part indices returned by live QQ servers and echoes them unchanged', async () => {
    const { qq, fetcher } = setup({ upload_id: 'upload', block_size: '100', parts: [{ index: 1, block_size: String(png.length), presigned_url: 'https://storage.example/part-1' }] })
    await qq.uploadImage('owner', png)
    const finish = fetcher.mock.calls.find(([url]) => String(url).endsWith('/upload_part_finish'))!
    expect(JSON.parse(String(finish[1]!.body))).toMatchObject({ part_index: 1, block_size: String(png.length) })
    expect(fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')![1]!.body).toEqual(new Uint8Array(png))
  })
  it('uploads exact local chunks without storage credentials or an active message and supports passive media', async () => {
    const { qq, fetcher } = setup()
    const bytes = Buffer.from(png)
    const pending = qq.uploadImage('owner/id', bytes, 'card.png')
    bytes.fill(0)
    const image = await pending
    expect(image).toEqual({ file_info: 'opaque-file-info', ttl: 300, raw_url: 'https://storage.example/image%281%29.png?sign=secret' })
    const calls = fetcher.mock.calls
    const prepare = calls.find(([url]) => String(url).endsWith('/upload_prepare'))!
    expect(prepare[0]).toBe('https://api.example/v2/users/owner%2Fid/upload_prepare')
    expect(JSON.parse(String(prepare[1]!.body))).toEqual({ file_type: 1, file_size: String(png.length), file_name: 'card.png', md5: digest('md5', png), sha1: digest('sha1', png), md5_10m: digest('md5', png) })
    const parts = calls.filter(([, init]) => init?.method === 'PUT')
    expect(parts.map(([url]) => String(url).split('?')[0])).toEqual(['https://storage.example/part-0', 'https://storage.example/part-1'])
    expect(Buffer.concat(parts.map(([, init]) => Buffer.from(init!.body as Uint8Array)))).toEqual(png)
    for (const [, init] of parts) {
      expect(init).not.toHaveProperty('headers')
      expect(init!.redirect).toBe('error')
    }
    expect(calls.filter(([url]) => String(url).endsWith('/upload_part_finish')).map(([, init]) => JSON.parse(String(init!.body)))).toEqual([0, 1].map(index => ({ upload_id: 'upload', part_index: index, block_size: String(png.subarray(index * 40, (index + 1) * 40).length), md5: digest('md5', png.subarray(index * 40, (index + 1) * 40)) })))
    expect(JSON.parse(String(calls.find(([url]) => String(url).endsWith('/files'))![1]!.body))).toEqual({ file_type: 1, file_name: 'card.png', upload_id: 'upload', srv_send_msg: false })
    expect(calls.some(([url]) => String(url).endsWith('/messages'))).toBe(false)
    await qq.reply('owner/id', 'incoming-id', { media: { file_info: image.file_info } }, 3)
    expect(JSON.parse(String(fetcher.mock.calls.at(-1)![1]!.body))).toEqual({ msg_type: 7, media: { file_info: 'opaque-file-info' }, msg_id: 'incoming-id', msg_seq: 3 })
  })

  it.each([
    { upload_id: 'upload', block_size: '0', parts: [] },
    { upload_id: 'upload', block_size: '1', parts: [] },
    { upload_id: 'upload', block_size: '100', parts: [{ index: 0, block_size: String(png.length), presigned_url: 'http://storage.example/unsafe' }] },
    { upload_id: 'upload', block_size: '40', parts: [{ index: 0, block_size: '40', presigned_url: 'https://storage.example/signed' }, { index: 0, block_size: String(png.length - 40), presigned_url: 'https://storage.example/duplicate' }] },
  ])('rejects invalid upload plans before transferring bytes: %j', async (prepared) => {
    const { qq, fetcher } = setup(prepared)
    await expect(qq.uploadImage('owner', png)).rejects.toThrow('Invalid QQ upload')
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/files'))).toBe(false)
  })

  it('stops after a failed chunk without merging or sending and hides storage response data', async () => {
    const { qq, fetcher } = setup()
    fetcher.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/token'))
        return json({ access_token: 'token', expires_in: 3600 })
      if (init?.method === 'PUT')
        return new Response('private-storage-signature', { status: 503 })
      return json({ upload_id: 'upload', block_size: '100', parts: [{ index: 0, block_size: String(png.length), presigned_url: 'https://storage.example/signed' }] })
    })
    await expect(qq.uploadImage('owner', png)).rejects.toEqual(new QQApiError(503))
    expect(fetcher.mock.calls).toHaveLength(3)
  })

  it('rejects unsupported, oversized or misleading files before authentication', async () => {
    const { qq, fetcher } = setup()
    for (const [bytes, name] of [[Buffer.from('private text'), 'image.png'], [png, '../image.png'], [png, 'image.jpg'], [Buffer.alloc(20 * 1024 * 1024 + 1), 'image.png']] as const)
      await expect(qq.uploadImage('owner', bytes, name)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
