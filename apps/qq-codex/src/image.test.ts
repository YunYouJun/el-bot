import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { helpCard, resultCard, statusCard } from './cards'
import { HELP_PAGES } from './constants'
import { cardSvg, imageLines, renderCardImage } from './image'
import { CardImageStore } from './image-store'

const stores: CardImageStore[] = []
afterEach(() => stores.splice(0).forEach(store => store.close()))

describe('local card image rendering and delivery leases', () => {
  it('renders an actual PNG with Chinese text and bounds dimensions', async () => {
    const card = resultCard({ id: 'test', project: 'demo', status: 'completed', output: '中文结果\nconst ok = true', createdAt: 'now' }, 1, 'owner')!
    const image = await renderCardImage(card, { theme: 'dark' })
    expect(image.png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(image.png.readUInt32BE(16)).toBe(image.width)
    expect(image.png.readUInt32BE(20)).toBe(image.height)
    expect(image.width).toBe(720)
    expect(image.height).toBeLessThanOrEqual(4000)
  }, 45000) // Cold Windows system-font discovery has taken 25 seconds in CI.

  it('wraps Unicode without losing text and escapes hostile SVG and remote images', () => {
    const output = '<image href="https://evil.example"/><script>alert(1)</script>\n中文👩‍💻'.repeat(4)
    expect(imageLines('中文👩‍💻'.repeat(30), 26, 120).join('')).toBe('中文👩‍💻'.repeat(30))
    const commandLines = imageLines('先查看详情，再 /confirm ID 确认；取消用 /cancel ID。', 23, 290)
    expect(commandLines.join('')).toBe('先查看详情，再 /confirm ID 确认；取消用 /cancel ID。')
    expect(commandLines.some(line => line.includes('/confirm'))).toBe(true)
    expect(commandLines.some(line => line.includes('/cancel'))).toBe(true)
    expect(imageLines('a'.repeat(100), 23, 120).length).toBeGreaterThan(1)
    const card = resultCard({ id: 'test', project: 'demo', status: 'failed', output, createdAt: 'now' }, 1, 'owner')!
    const image = cardSvg(card, { theme: 'light', fontFamily: 'font"/><script>' })
    expect(image.svg).not.toContain('<image ')
    expect(image.svg).not.toContain('<script>')
    expect(image.svg).toContain('&lt;image')
    expect(image.svg).toContain('#dc2626')
    card.visual!.details.body = '\n'.repeat(200)
    expect(() => cardSvg(card, { theme: 'light' })).toThrow('too tall')
  })

  it('distinguishes trusted help commands, parameters and descriptions without printing long URLs', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (let page = 1; page <= HELP_PAGES.length; page++) {
        for (let part = 1; ; part++) {
          const card = helpCard('el-bot', page, 'owner', undefined, { image: true, part })
          if (!card)
            break
          const { svg, height } = cardSvg(card, { theme })
          expect(height).toBeLessThanOrEqual(1100)
          expect(svg).not.toContain('https://')
          expect(svg).toContain('使用提醒')
          expect(card.payload.markdown.content).toContain('https://docs.bot.elpsy.cn/')
          expect(svg).toContain(theme === 'dark' ? '#7dd3fc' : '#1d4ed8')
          for (const entry of card.visual!.details.help!.commands)
            expect(svg).toContain(`font-weight="600">${entry.command}`)
        }
      }
    }
    const card = helpCard('demo', 1, 'owner', '<script>alert(1)</script>', { image: true })!
    const { svg } = cardSvg(card, { theme: 'dark' })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
    expect(svg).toMatch(/<text x="[\d.]+" y="\d+"[^>]+font-size="24">提示词<\/text>/)
    expect(svg).toContain('font-size="26" xml:space="preserve">提交任务')
    const result = resultCard({ id: 'test', project: 'demo', status: 'completed', output: '/run injected：text', createdAt: 'now' }, 1, 'owner')!
    expect(result.visual!.details.help).toBeUndefined()
    expect(cardSvg(result, { theme: 'dark' }).svg).not.toContain('Menlo')
  })

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
