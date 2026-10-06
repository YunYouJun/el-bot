import type { CardRenderOptions, ImageCard } from './types'
import { escapeHtml, fontFamilies } from './escape'
import { renderMarkdown } from './markdown'
import { CARD_CSS } from './styles'

function footnote(value: string): string {
  return escapeHtml(value).replace(/\/[a-z][a-z0-9:-]*(?: [a-f0-9]{8,32}\b)?/gi, command => `<code>${command}</code>`)
}

/** Build an inert document shared by screenshots and static site previews. */
export function renderCardHtml(card: ImageCard, options: Pick<CardRenderOptions, 'theme' | 'fontFamily'>): string {
  const { title, details, tone } = card
  const help = details.help
  const content = [
    title,
    details.body,
    details.footnote,
    details.section ?? '',
    ...details.fields?.flatMap(field => [field.label, field.value]) ?? [],
    ...details.links?.flatMap(link => [link.label, link.url]) ?? [],
    ...help ? [help.intro ?? '', help.footer, ...help.notes, ...help.commands.flatMap(entry => [entry.command, entry.parameters ?? '', entry.description, ...entry.relatedCommands ?? []])] : [],
  ]
  if (content.reduce((length, value) => length + value.length, 0) > 12000)
    throw new Error('Card cannot be rendered as a bounded image')
  const fields = details.fields?.length
    ? `<dl class="el-fields">${details.fields.map(field => `<dt>${escapeHtml(field.label)}</dt><dd${/(?:任务|会话|线程|编号|ID)$/i.test(field.label) ? ' class="el-identifier"' : ''}>${escapeHtml(field.value)}</dd>`).join('')}</dl>`
    : ''
  const heading = escapeHtml(title.replace(/^[^\p{L}\p{N}]+/u, ''))
  const marker = ['success', 'warning', 'danger'].includes(tone) ? '<span class="el-state-mark" aria-hidden="true"></span>' : ''
  const header = help ? `<p class="el-kicker">${heading}</p><h1 class="el-title">${escapeHtml(details.section ?? title)}</h1>` : `<div class="el-heading">${marker}<h1 class="el-title">${heading}</h1></div>`
  const body = help
    ? `${help.intro ? `<p class="el-help-intro">${escapeHtml(help.intro)}</p>` : ''}${help.commands.map(entry => `<section class="el-help-entry"><div class="el-help-command"><code class="el-command">${escapeHtml([entry.command, ...entry.relatedCommands ?? []].join('  '))}</code>${entry.parameters ? `<span class="el-parameter">${escapeHtml(entry.parameters)}</span>` : ''}</div><p class="el-help-description">${escapeHtml(entry.description)}</p></section>`).join('')}<aside class="el-help-notes"><h2>使用提醒</h2>${help.notes.map(note => `<p class="el-footnote">${footnote(note)}</p>`).join('')}</aside>`
    : `${details.section ? `<h2 class="el-section">${escapeHtml(details.section)}</h2>` : ''}<div class="el-body${details.bodyFormat ? '' : ' el-literal'}">${details.bodyFormat === 'markdown' ? renderMarkdown(details.body, options.theme) : escapeHtml(details.body)}</div>${details.links?.length ? `<div class="el-links">${details.links.map(link => `${escapeHtml(link.label)}：${escapeHtml(link.url)}`).join('<br>')}</div>` : ''}<hr class="el-divider">`
  return `<!doctype html><html lang="zh-CN" class="ylf-theme-${escapeHtml(options.theme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><title>${escapeHtml(title)}</title><style>${CARD_CSS}\n.el-card-page { --card-font: ${fontFamilies(options.fontFamily)}; --card-heading-font: ${options.fontFamily ? 'var(--card-font)' : 'var(--ylf-font-heading)'}; }</style></head><body><main class="el-card-page" data-theme="${escapeHtml(options.theme)}" data-tone="${escapeHtml(tone)}"><article class="el-card ylf-card ylf-card--accent" data-ylf-tone="blue">${header}${fields}<hr class="el-divider">${body}<footer class="el-footnote">${footnote(help?.footer ?? details.footnote)}</footer></article></main></body></html>`
}
