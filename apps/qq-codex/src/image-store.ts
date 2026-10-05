import type { CardImage } from './image'
import type { ImageOptions, ReplyCard } from './types'
import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { renderCardImage } from './image'

/** Opaque, short-lived PNG leases. No filesystem, task IDs or directory listing are exposed. */
export class CardImageStore {
  private images = new Map<string, { image: CardImage, expires: number }>()
  private closed = false
  private timer: ReturnType<typeof setInterval>
  readonly app = new Hono()

  constructor(private options: ImageOptions & { publicBaseUrl: string }, private render = renderCardImage, private now = Date.now) {
    this.timer = setInterval(() => this.prune(), 60000)
    this.timer.unref()
    this.app.get('/qq-codex/images/:name', (context) => {
      this.prune()
      const entry = this.images.get(context.req.param('name'))
      if (!entry)
        return context.notFound()
      return new Response(new Uint8Array(entry.image.png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } })
    })
  }

  async publish(card: ReplyCard): Promise<{ url: string, width: number, height: number }> {
    if (this.closed)
      throw new Error('Image publisher is closed')
    const image = await this.render(card, this.options)
    if (this.closed)
      throw new Error('Image publisher is closed')
    if (image.png.length > 2 * 1024 * 1024)
      throw new Error('Rendered image is too large')
    this.prune()
    while (this.images.size >= 64 || [...this.images.values()].reduce((sum, value) => sum + value.image.png.length, 0) + image.png.length > 16 * 1024 * 1024)
      this.images.delete(this.images.keys().next().value!)
    const name = `${randomBytes(24).toString('hex')}.png`
    this.images.set(name, { image, expires: this.now() + 10 * 60 * 1000 })
    return { url: `${this.options.publicBaseUrl}/${name}`, width: image.width, height: image.height }
  }

  private prune() {
    for (const [key, value] of this.images) {
      if (value.expires <= this.now())
        this.images.delete(key)
    }
  }

  close() {
    this.closed = true
    clearInterval(this.timer)
    this.images.clear()
  }
}
