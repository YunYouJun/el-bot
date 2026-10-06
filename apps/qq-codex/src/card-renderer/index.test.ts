import type { ImageCard } from './index'
import { Buffer } from 'node:buffer'
import { chromium } from 'playwright'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeCardRenderer, renderCardHtml, renderCardImage } from './index'

const card: ImageCard = {
  title: 'Render preview',
  tone: 'success',
  details: { body: '**中文结果** *中文斜体*\n\n```ts\nconst ok = true\n```', bodyFormat: 'markdown', footnote: '' },
}

afterEach(closeCardRenderer)

describe('platform-independent browser card renderer', () => {
  it('renders immutable content, reuses Chromium and drains isolated contexts', async () => {
    const launch = vi.spyOn(chromium, 'launch')
    const input = Object.freeze({ ...card, details: Object.freeze({ ...card.details }) })
    expect(renderCardHtml(input, { theme: 'dark' })).toContain('<strong>中文结果</strong>')
    const images = await Promise.all(['dark', 'light'].map(theme => renderCardImage(input, { theme: theme as 'light' | 'dark' })))
    for (const image of images) {
      expect(image.png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      expect(image.width).toBe(720)
      expect(image.png.readUInt32BE(16)).toBe(image.width)
      expect(image.png.readUInt32BE(20)).toBe(image.height)
    }
    expect(images[0].png).not.toEqual(images[1].png)
    expect(launch).toHaveBeenCalledTimes(1)
    const browser = await launch.mock.results[0].value
    expect(browser.contexts()).toHaveLength(0)
    await closeCardRenderer()
    expect(browser.isConnected()).toBe(false)
    expect(input.details.body).toBe(card.details.body)
  }, 45000)

  it('rejects excessive content and actual rendered height, then accepts the next card', async () => {
    const details = { ...card.details, body: 'x'.repeat(12001) }
    expect(() => renderCardHtml({ ...card, details }, { theme: 'light' })).toThrow('bounded image')
    await expect(renderCardImage({ ...card, details }, { theme: 'light' })).rejects.toThrow('bounded image')
    expect(() => renderCardHtml({ ...card, details: { ...card.details, fields: [{ label: 'ID', value: 'x'.repeat(12001) }] } }, { theme: 'light' })).toThrow('bounded image')
    await expect(renderCardImage({ ...card, details: { ...card.details, body: '\n'.repeat(200), bodyFormat: undefined } }, { theme: 'dark' })).rejects.toThrow('too tall')
    expect((await renderCardImage(card, { theme: 'dark' })).width).toBe(720)
  }, 45000)

  it('reports missing Chromium without poisoning a subsequent render', async () => {
    vi.spyOn(chromium, 'launch').mockRejectedValueOnce(new Error('Executable does not exist'))
    await expect(renderCardImage(card, { theme: 'dark' })).rejects.toThrow('browser-install')
    expect((await renderCardImage(card, { theme: 'dark' })).width).toBe(720)
  }, 45000)

  it('lets Chromium lay out styled Unicode, code and tables without loading external content', async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 720, height: 1000 } })
      const page = await context.newPage()
      const requests: string[] = []
      page.on('request', request => requests.push(request.url()))
      const source = '中文👩‍💻 **粗体** *斜体* ~~删除~~ `行内代码`\n\n```ts\n\tconst message = "中文👩‍💻"\n```\n\n| 名称 | 值 |\n| --- | --- |\n| 标题 | **el-bot** |\n\n![remote](https://evil.example/image.png) <script>window.injected = true</script>'
      await page.setContent(renderCardHtml({ ...card, details: { ...card.details, body: source } }, { theme: 'dark' }))
      const actual = await page.evaluate(`({
        bold: getComputedStyle(document.querySelector('.el-body strong')).fontWeight,
        italic: getComputedStyle(document.querySelector('.el-body em')).fontStyle,
        code: document.querySelector('pre code').textContent,
        table: document.querySelectorAll('td').length,
        overflow: document.documentElement.scrollWidth > 720,
        scripts: document.querySelectorAll('script,img,a').length,
        surface: getComputedStyle(document.querySelector('.el-card')).backgroundColor,
        status: getComputedStyle(document.querySelector('.el-state-mark')).backgroundColor,
        accent: getComputedStyle(document.querySelector('.el-card')).borderTopColor,
        leftBorder: getComputedStyle(document.querySelector('.el-card')).borderLeftWidth,
        headingFont: getComputedStyle(document.querySelector('.el-title')).fontFamily,
        codeFont: getComputedStyle(document.querySelector('pre code')).fontFamily,
      })`)
      expect(actual).toMatchObject({ bold: '700', italic: 'italic', code: '\tconst message = "中文👩‍💻"', table: 2, overflow: false, scripts: 0, surface: 'rgb(24, 33, 45)', status: 'rgb(34, 197, 94)', accent: 'rgb(96, 165, 250)', leftBorder: '1px' })
      expect(actual).toMatchObject({ headingFont: expect.stringContaining('ui-rounded'), codeFont: expect.stringContaining('SFMono-Regular') })
      await page.setContent(renderCardHtml({ ...card, details: { ...card.details, body: source } }, { theme: 'light', fontFamily: 'Arial' }))
      expect(await page.evaluate(`({
        font: getComputedStyle(document.querySelector('.el-title')).fontFamily,
        surface: getComputedStyle(document.querySelector('.el-card')).backgroundColor,
      })`)).toMatchObject({ font: expect.stringContaining('Arial'), surface: 'rgb(255, 255, 255)' })
      expect(requests).toEqual([])
    }
    finally { await browser.close() }
  }, 45000)
})
