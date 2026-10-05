import type { ImageOptions, ReplyCard } from './types'
import { Buffer } from 'node:buffer'

export interface CardImage {
  png: Buffer
  width: number
  height: number
}

const palettes = {
  light: { background: '#f1f5f9', card: '#ffffff', body: '#0f172a', muted: '#475569', panel: '#f8fafc', line: '#e2e8f0' },
  dark: { background: '#0f172a', card: '#1e293b', body: '#f1f5f9', muted: '#cbd5e1', panel: '#111827', line: '#334155' },
}
const accents = {
  light: { primary: '#2563eb', success: '#15803d', warning: '#b45309', danger: '#dc2626', muted: '#475569' },
  dark: { primary: '#3b82f6', success: '#22c55e', warning: '#f59e0b', danger: '#f87171', muted: '#94a3b8' },
}
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })
const wordCharacter = /^[\w./-]$/

function graphemeWidth(value: string, size: number): number {
  return /^[\x20-\x7E]$/.test(value) && !/[MW@%&#]/i.test(value) ? size * 0.66 : size
}

function textWidth(value: string, size: number): number {
  return Array.from(segmenter.segment(value), ({ segment }) => graphemeWidth(segment, size)).reduce((sum, cost) => sum + cost, 0)
}

function xml(text: string): string {
  return text.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;' })[value]!)
    .replace(/[\p{Cc}\uFFFE\uFFFF]/gu, value => ['\n', '\r', '\t'].includes(value) ? value : '�')
}

/** Preserve literal content; no HTML, Markdown image, URL or script is executed. */
export function imageLines(text: string, size: number, width: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    let used = 0
    const graphemes = Array.from(segmenter.segment(paragraph.replace(/\t/g, '    ')), ({ segment }) => segment)
    for (let index = 0; index < graphemes.length;) {
      const token = [graphemes[index++]]
      if (wordCharacter.test(token[0])) {
        while (index < graphemes.length && wordCharacter.test(graphemes[index]))
          token.push(graphemes[index++])
      }
      const tokenWidth = token.reduce((sum, value) => sum + graphemeWidth(value, size), 0)
      // Keep ordinary commands and words whole; split only tokens wider than a full line.
      if (line && tokenWidth <= width && used + tokenWidth > width) {
        lines.push(line)
        line = ''
        used = 0
      }
      for (const segment of token) {
        const cost = graphemeWidth(segment, size)
        if (line && used + cost > width) {
          lines.push(line)
          line = ''
          used = 0
        }
        line += segment
        used += cost
      }
    }
    lines.push(line)
  }
  return lines
}

/** Render trusted card structure and escaped literal output using local fonts only. */
export function cardSvg(card: ReplyCard, options: Pick<ImageOptions, 'theme' | 'fontFamily'>): { svg: string, width: number, height: number } {
  if (!card.visual || card.text.length > 12000)
    throw new Error('Card cannot be rendered as a bounded image')
  const { title, details, tone } = card.visual
  const colors = palettes[options.theme]
  const accent = accents[options.theme][tone]
  const width = 720
  const contentWidth = 608
  const font = xml(options.fontFamily ?? 'PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif')
  const codeFont = 'Menlo,Consolas,monospace'
  const nodes: string[] = []
  let y = details.help ? 46 : 54
  const text = (value: string, size: number, color: string, bold = false, indent = 0) => {
    for (const line of imageLines(value, size, contentWidth - indent)) {
      y += size + 10
      nodes.push(`<text x="${56 + indent}" y="${y}" fill="${color}" font-family="${font}" font-size="${size}" xml:space="preserve"${bold ? ' font-weight="600"' : ''}>${xml(line)}</text>`)
    }
  }
  if (details.help) {
    const help = details.help
    const commandColor = options.theme === 'dark' ? '#7dd3fc' : '#1d4ed8'
    text(title.replace(/^[^\p{L}\p{N}]+/u, ''), 22, colors.muted)
    if (details.section)
      text(details.section, 34, colors.body, true)
    y += 4
    for (const field of details.fields ?? [])
      text(`${field.label}：${field.value}`, 22, colors.muted)
    y += 20
    nodes.push(`<path d="M56 ${y} H664" stroke="${colors.line}"/>`)
    if (help.intro) {
      y += 8
      text(help.intro, 24, colors.body)
      y += 14
    }
    for (const [index, entry] of help.commands.entries()) {
      y += index === 0 ? 4 : 18
      const command = [entry.command, ...entry.relatedCommands ?? []].join('  ')
      const size = command.length > 26 ? 28 : 32
      const lines = imageLines(command, size, contentWidth)
      const inline = entry.parameters && lines.length === 1 && imageLines(`${command}  ${entry.parameters}`, size, contentWidth).length === 1
      for (const line of lines) {
        y += size + 10
        nodes.push(`<text x="56" y="${y}" fill="${commandColor}" font-family="${codeFont}" font-size="${size}" xml:space="preserve" font-weight="600">${xml(line)}</text>`)
        if (inline)
          nodes.push(`<text x="${56 + textWidth(line, size) + 16}" y="${y}" fill="${colors.muted}" font-family="${font}" font-size="24">${xml(entry.parameters!)}</text>`)
      }
      if (entry.parameters && !inline)
        text(entry.parameters, 24, colors.muted)
      text(entry.description, 26, colors.body)
      if (index < help.commands.length - 1) {
        y += 18
        nodes.push(`<path d="M56 ${y} H664" stroke="${colors.line}"/>`)
      }
    }
    y += 26
    const notesTop = y
    y += 8
    text('使用提醒', 21, colors.muted, true, 16)
    for (const note of help.notes)
      text(note, 23, colors.muted, false, 16)
    y += 18
    nodes.unshift(`<rect x="44" y="${notesTop}" width="632" height="${y - notesTop}" rx="12" fill="${colors.panel}"/>`)
    y += 12
    text(help.footer, 21, colors.muted)
  }
  else {
    text(title.replace(/^[^\p{L}\p{N}]+/u, ''), 32, colors.body, true)
    y += 12
    for (const field of details.fields ?? [])
      text(`${field.label}：${field.value}`, 24, colors.muted)
    y += 14
    if (details.section) {
      text(details.section, 25, accent, true)
      y += 12
    }
    const panelTop = y
    y += 12
    text(details.body, 26, colors.body, false, 16)
    y += 22
    const panelBottom = y
    nodes.unshift(`<rect x="44" y="${panelTop}" width="632" height="${panelBottom - panelTop}" rx="12" fill="${colors.panel}"/>`)
    y += 12
    for (const link of details.links ?? [])
      text(`${link.label}：${link.url}`, 19, colors.muted)
    y += 12
    nodes.push(`<path d="M56 ${y} H664" stroke="${colors.line}"/>`)
    y += 8
    text(details.footnote, 20, colors.muted)
  }
  const height = y + 44
  if (height > 4000)
    throw new Error('Image page is too tall; use the Markdown fallback')
  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="720" height="${height}" fill="${colors.background}"/><rect x="20" y="20" width="680" height="${height - 40}" rx="20" fill="${colors.card}"/><rect x="20" y="40" width="6" height="${height - 80}" rx="3" fill="${accent}"/>${nodes.join('')}</svg>`,
  }
}

export async function renderCardImage(card: ReplyCard, options: Pick<ImageOptions, 'theme' | 'fontFamily' | 'fontFiles'>): Promise<CardImage> {
  const { Resvg } = await import('@resvg/resvg-js')
  const { svg, width, height } = cardSvg(card, options)
  const image = new Resvg(svg, { font: { loadSystemFonts: true, fontFiles: options.fontFiles, defaultFontFamily: options.fontFamily } }).render()
  const png = Buffer.from(image.asPng())
  if (png.length > 2 * 1024 * 1024)
    throw new Error('Rendered card exceeds the image size limit')
  return { png, width, height }
}
