import MarkdownIt from 'markdown-it'
import { escapeHtml } from './escape'
import { codeRuns } from './highlight'

function parser(theme: 'light' | 'dark') {
  const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: true })
  markdown.renderer.rules.link_open = () => '<span class="el-markdown-link">'
  markdown.renderer.rules.link_close = () => '</span>'
  markdown.renderer.rules.image = (tokens, index) => `<span class="el-image-label">[图片：${escapeHtml(tokens[index].content || '图片')}]</span>`
  const code: NonNullable<typeof markdown.renderer.rules.fence> = (tokens, index) => {
    const token = tokens[index]
    const language = token.info.trim().split(/\s+/)[0]?.slice(0, 36)
    const content = codeRuns(token.content.replace(/\n$/, ''), language, theme).map(run =>
      run.syntaxColor ? `<span style="color:${run.syntaxColor}">${escapeHtml(run.text)}</span>` : escapeHtml(run.text),
    ).join('')
    return `<div class="el-code-block">${language ? `<div class="el-code-language">${escapeHtml(language)}</div>` : ''}<pre><code>${content}</code></pre></div>`
  }
  markdown.renderer.rules.fence = code
  markdown.renderer.rules.code_block = code
  return markdown
}

const parsers = { light: parser('light'), dark: parser('dark') }

/** Only fixed Markdown tags are emitted; links and images remain inert text. */
export function renderMarkdown(source: string, theme: 'light' | 'dark'): string {
  return parsers[theme].render(source)
}
