import { Buffer } from 'node:buffer'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { helpCard, resultCard, statusCard } from './cards'
import { HELP_PAGES } from './constants'
import { cardHtml, closeCardRenderer, renderCardImage } from './image'
import { CardImageStore } from './image-store'

const stores: CardImageStore[] = []
afterEach(() => stores.splice(0).forEach(store => store.close()))
afterAll(closeCardRenderer)

describe('local card image rendering and delivery leases', () => {
  it('renders result Markdown while keeping fallback text and other bodies literal', () => {
    const output = '明白，是 **el-bot 将机器人回复渲染成图片时，Markdown 粗体没有生效**。'
    const card = resultCard({ id: 'test', project: 'demo', status: 'completed', output, createdAt: 'now' }, 1, 'owner')!
    for (const theme of ['light', 'dark'] as const) {
      expect(cardHtml(card, { theme })).toContain('<strong>el-bot 将机器人回复渲染成图片时，Markdown 粗体没有生效</strong>')
      expect(card.text).toContain(output)
      const literal = '**project** `command`'
      expect(cardHtml(statusCard(literal, undefined, [], 1, 'owner', literal)!, { theme })).toContain(literal)
    }
    expect(() => cardHtml({ ...card, visual: undefined }, { theme: 'light' })).toThrow('bounded image')
    expect(() => cardHtml({ ...card, text: 'x'.repeat(12001) }, { theme: 'light' })).toThrow('bounded image')
  })

  it('preserves structured help typography and copyable links outside the image', () => {
    for (let page = 1; page <= HELP_PAGES.length; page++) {
      for (let part = 1; ; part++) {
        const card = helpCard('el-bot', page, 'owner', undefined, { image: true, part })
        if (!card)
          break
        const html = cardHtml(card, { theme: 'dark' })
        expect(html).toContain('使用提醒')
        expect(html).not.toContain('https://')
        expect(card.payload.markdown.content).toContain('https://docs.bot.elpsy.cn/')
        for (const entry of card.visual!.details.help!.commands)
          expect(html).toContain(`class="el-command">${entry.command}`)
      }
    }
  })

  it('renders result and paginated help cards as bounded PNG files', async () => {
    const cards = [
      resultCard({ id: 'test', project: 'demo', status: 'completed', output: '**中文结果**\n```ts\nconst ok = true\n```', createdAt: 'now' }, 1, 'owner')!,
      helpCard('demo', 1, 'owner', undefined, { image: true, part: 2 })!,
    ]
    for (const card of cards) {
      const image = await renderCardImage(card, { theme: 'dark' })
      expect(image.png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      expect(image.png.readUInt32BE(16)).toBe(720)
      expect(image.png.readUInt32BE(20)).toBe(image.height)
      expect(image.height).toBeLessThanOrEqual(card.visual!.details.help ? 1100 : 4000)
    }
  }, 45000)

  it('serves only generated PNG leases, expires them and clears them at shutdown', async () => {
    let now = 1000
    const png = Buffer.from('test-image')
    const render = vi.fn(async () => ({ png, width: 720, height: 800 }))
    const store = new CardImageStore({ publicBaseUrl: 'https://bot.example/qq-codex/images', theme: 'light' }, render, () => now)
    stores.push(store)
    const image = await store.publish(statusCard('demo', undefined, [], 1, 'owner')!)
    expect(image.url).toMatch(/\/[a-f0-9]{48}\.png$/)
    const path = new URL(image.url).pathname
    const response = await store.app.request(path)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png)
    expect((await store.app.request('/qq-codex/images')).status).toBe(404)
    expect((await store.app.request('/qq-codex/images/../../state.json')).status).toBe(404)
    now += 10 * 60 * 1000
    expect((await store.app.request(path)).status).toBe(404)
    const next = await store.publish(statusCard('demo', undefined, [], 1, 'owner')!)
    store.close()
    expect((await store.app.request(new URL(next.url).pathname)).status).toBe(404)
    await expect(store.publish(statusCard('demo', undefined, [], 1, 'owner')!)).rejects.toThrow('closed')
  })

  it('evicts old images to keep the memory budget and rejects oversized renders', async () => {
    const render = vi.fn(async () => ({ png: Buffer.alloc(1024 * 1024), width: 720, height: 800 }))
    const store = new CardImageStore({ publicBaseUrl: 'https://bot.example/qq-codex/images', theme: 'light' }, render)
    stores.push(store)
    const card = statusCard('demo', undefined, [], 1, 'owner')!
    const first = await store.publish(card)
    for (let index = 0; index < 16; index++) await store.publish(card)
    expect((await store.app.request(new URL(first.url).pathname)).status).toBe(404)
    render.mockResolvedValueOnce({ png: Buffer.alloc(2 * 1024 * 1024 + 1), width: 720, height: 800 })
    await expect(store.publish(card)).rejects.toThrow('too large')
  })
})
