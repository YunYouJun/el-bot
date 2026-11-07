export interface TransportAttachment {
  kind: 'image' | 'voice' | 'video' | 'file'
  name?: string
  contentType?: string
  size?: number
  width?: number
  height?: number
  url?: string
}

/** Display-only QQ CDN URLs; never forward arbitrary attachment hosts or local paths. */
function imageURL(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4096)
    return
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port
      || !(url.hostname.endsWith('.qpic.cn') || ['multimedia.nt.qq.com', 'multimedia.nt.qq.com.cn'].includes(url.hostname))) {
      return
    }
    url.protocol = 'https:'
    url.hash = ''
    return url.href
  }
  catch {}
}

const positive = (value: unknown, limit: number) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= limit ? value : undefined

/** Copy a bounded projection before the model middleware strips attachments. */
export function transportAttachments(value: unknown): TransportAttachment[] | undefined {
  if (!Array.isArray(value))
    return
  const result: TransportAttachment[] = []
  for (const entry of value.slice(0, 12)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      continue
    const item = entry as Record<string, unknown>
    const contentType = typeof item.content_type === 'string' ? item.content_type.slice(0, 100).toLowerCase() : 'application/octet-stream'
    const kind = contentType.startsWith('image/') || contentType === 'image'
      ? 'image'
      : contentType.startsWith('video/') || contentType === 'video'
        ? 'video'
        : contentType.startsWith('audio/') || /voice|silk|amr/.test(contentType) ? 'voice' : 'file'
    result.push({
      kind,
      name: typeof item.filename === 'string' ? item.filename.replace(/\p{Cc}/gu, '').slice(0, 200) : undefined,
      contentType,
      size: positive(item.size, 1024 * 1024 * 1024),
      width: positive(item.width, 100_000),
      height: positive(item.height, 100_000),
      url: kind === 'image' ? imageURL(item.url) : undefined,
    })
  }
  return result.length ? result : undefined
}

/** Revalidate stored display fields, including CDN URLs, when loading old history. */
export function storedAttachments(value: unknown): TransportAttachment[] | undefined {
  if (!Array.isArray(value))
    return
  return transportAttachments(value.slice(0, 12).map(item => item && typeof item === 'object'
    ? {
        content_type: item.contentType ?? item.kind,
        filename: item.name,
        size: item.size,
        width: item.width,
        height: item.height,
        url: item.url,
      }
    : undefined))
}
