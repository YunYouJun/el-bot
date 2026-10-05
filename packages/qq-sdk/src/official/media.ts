import type { QQUploadedMedia } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { isRecord, QQApiError } from './client'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024

function checksum(algorithm: 'md5' | 'sha1', bytes: Uint8Array) {
  return createHash(algorithm).update(bytes).digest('hex')
}

function httpsUrl(value: unknown, markdown = false): string {
  if (typeof value !== 'string')
    throw new Error('Invalid QQ upload URL')
  let url: URL
  try {
    url = new URL(value)
  }
  catch { throw new Error('Invalid QQ upload URL') }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || /\s/.test(value))
    throw new Error('Invalid QQ upload URL')
  return markdown ? url.href.replace(/[()]/g, character => character === '(' ? '%28' : '%29') : url.href
}

/** Upload local bytes through QQ-provided storage, without sending an active message. */
export async function uploadC2CImage(request: (path: string, body: unknown) => Promise<unknown>, openId: string, data: Uint8Array, fileName: string): Promise<QQUploadedMedia> {
  if (!data.length || data.length > MAX_IMAGE_BYTES)
    throw new Error('QQ images must contain between 1 byte and 20 MiB')
  // Copy before awaiting so later caller mutations cannot invalidate the checksums.
  const bytes = Buffer.from(data)
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
  if ((!png && !jpeg) || !/^[\w.-]{1,128}\.(?:png|jpe?g)$/i.test(fileName) || (png ? !/\.png$/i.test(fileName) : !/\.jpe?g$/i.test(fileName)))
    throw new Error('QQ local image uploads require PNG or JPEG bytes and a matching filename')
  const path = `/v2/users/${encodeURIComponent(openId)}`
  const prepared = await request(`${path}/upload_prepare`, {
    file_type: 1,
    file_size: String(bytes.length),
    file_name: fileName,
    md5: checksum('md5', bytes),
    sha1: checksum('sha1', bytes),
    md5_10m: checksum('md5', bytes.subarray(0, 10002432)),
  })
  if (!isRecord(prepared) || typeof prepared.upload_id !== 'string' || !prepared.upload_id || !Array.isArray(prepared.parts))
    throw new Error('Invalid QQ upload preparation')
  const rawParts: unknown[] = prepared.parts
  const blockSize = Number(prepared.block_size)
  const count = Math.ceil(bytes.length / blockSize)
  if (!Number.isSafeInteger(blockSize) || blockSize < 1 || count > 64 || rawParts.length !== count)
    throw new Error('Invalid QQ upload parts')
  // Documentation uses zero-based indices; current servers can return one-based indices.
  const firstIndex = rawParts.some(part => isRecord(part) && part.index === 0) ? 0 : 1
  // Validate the entire plan before transferring bytes. Never forward QQ credentials to storage.
  const parts = Array.from({ length: count }, (_, offset) => {
    const index = offset + firstIndex
    const part = rawParts.find(part => isRecord(part) && part.index === index)
    const chunk = bytes.subarray(offset * blockSize, Math.min((offset + 1) * blockSize, bytes.length))
    if (!isRecord(part) || rawParts.filter(part => isRecord(part) && part.index === index).length !== 1 || ![chunk.length, blockSize].includes(Number(part.block_size)))
      throw new Error('Invalid QQ upload part')
    return { index, chunk, url: httpsUrl(part.presigned_url) }
  })
  for (const part of parts) {
    const response = await fetch(part.url, {
      method: 'PUT',
      body: new Uint8Array(part.chunk),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    await response.body?.cancel()
    if (!response.ok)
      throw new QQApiError(response.status)
    await request(`${path}/upload_part_finish`, {
      upload_id: prepared.upload_id,
      part_index: part.index,
      block_size: String(part.chunk.length),
      md5: checksum('md5', part.chunk),
    })
  }
  const uploaded = await request(`${path}/files`, { file_type: 1, file_name: fileName, upload_id: prepared.upload_id, srv_send_msg: false })
  if (!isRecord(uploaded) || typeof uploaded.file_info !== 'string' || !uploaded.file_info || !Number.isSafeInteger(uploaded.ttl) || Number(uploaded.ttl) < 0)
    throw new Error('Invalid QQ uploaded image')
  return {
    file_info: uploaded.file_info,
    ttl: Number(uploaded.ttl),
    ...(typeof uploaded.file_uuid === 'string' ? { file_uuid: uploaded.file_uuid } : {}),
    ...(uploaded.raw_url === undefined ? {} : { raw_url: httpsUrl(uploaded.raw_url, true) }),
  }
}
