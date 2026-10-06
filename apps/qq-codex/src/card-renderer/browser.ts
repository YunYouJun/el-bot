import type { Browser } from 'playwright'
import type { CardImage, CardRenderOptions } from './types'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { fontFamilies } from './escape'

async function fontStyles(options: CardRenderOptions): Promise<string> {
  const files = options.fontFiles ?? []
  if (files.length > 8)
    throw new Error('At most eight local font files are supported')
  const faces: string[] = []
  const families: string[] = []
  for (const [index, file] of files.entries()) {
    const extension = extname(file).slice(1).toLowerCase()
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(extension))
      throw new Error('Local fonts must be TTF, OTF, WOFF or WOFF2 files')
    const info = await stat(file)
    if (!info.isFile() || info.size > 32 * 1024 * 1024)
      throw new Error('Local font files must be at most 32 MiB')
    const family = `ElBotLocal${index}`
    const format = extension === 'ttf' ? 'truetype' : extension === 'otf' ? 'opentype' : extension
    const data = (await readFile(file)).toString('base64')
    faces.push(`@font-face{font-family:"${family}";src:url(data:font/${extension};base64,${data}) format("${format}");font-display:block;}`)
    families.push(`"${family}"`)
  }
  return files.length ? `${faces.join('')} .el-card-page{--card-font:${families.join(',')},${fontFamilies(options.fontFamily)};--card-heading-font:var(--card-font);}` : ''
}

/** A bounded serial queue reuses Chromium; each screenshot gets an isolated context. */
export class BrowserRenderer {
  private browser?: Browser
  private work = Promise.resolve()
  private closing?: Promise<void>
  private idle?: ReturnType<typeof setTimeout>
  private queued = 0

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected())
      return this.browser
    try {
      const { chromium } = await import('playwright')
      const browser = await chromium.launch({ headless: true, timeout: 15000 })
      this.browser = browser
      browser.on('disconnected', () => {
        if (this.browser === browser)
          this.browser = undefined
      })
      return browser
    }
    catch (cause) {
      throw new Error('Chromium is unavailable. Run "el-bot codex browser-install" before rendering image cards.', { cause })
    }
  }

  render(html: string, options: CardRenderOptions): Promise<CardImage> {
    if (this.closing || this.queued >= 8)
      return Promise.reject(new Error('Image renderer is busy or shutting down'))
    clearTimeout(this.idle)
    this.queued++
    const result = this.work.then(async () => {
      const fonts = await fontStyles(options)
      const browser = await this.getBrowser()
      const context = await browser.newContext({
        viewport: { width: 720, height: 900 },
        deviceScaleFactor: 1,
        javaScriptEnabled: false,
        offline: true,
        serviceWorkers: 'block',
        acceptDownloads: false,
      })
      try {
        await context.route('**/*', route => route.abort())
        const page = await context.newPage()
        page.setDefaultTimeout(15000)
        await page.setContent(html, { waitUntil: 'load', timeout: 15000 })
        if (fonts)
          await page.addStyleTag({ content: fonts })
        await page.evaluate(() => Promise.race([
          (globalThis as typeof globalThis & { document: { fonts: { ready: Promise<unknown> } } }).document.fonts.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Local font loading timed out')), 15000)),
        ]))
        const card = page.locator('.el-card-page')
        const bounds = await card.boundingBox()
        if (!bounds || Math.ceil(bounds.height) > 4000)
          throw new Error('Image page is too tall; use the Markdown fallback')
        const png = await card.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', timeout: 15000 })
        if (png.length > 2 * 1024 * 1024)
          throw new Error('Rendered card exceeds the image size limit')
        return { png, width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
      }
      finally { await context.close() }
    }).finally(() => {
      this.queued--
      if (!this.queued && !this.closing) {
        this.idle = setTimeout(() => {
          void this.close().catch(() => {})
        }, 30000)
        this.idle.unref()
      }
    })
    this.work = result.then(() => {}, () => {})
    return result
  }

  close(): Promise<void> {
    clearTimeout(this.idle)
    this.closing ??= this.work.then(async () => {
      const browser = this.browser
      this.browser = undefined
      await browser?.close()
    }).finally(() => { this.closing = undefined })
    return this.closing
  }
}
