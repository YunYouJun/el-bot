import { describe, expect, it } from 'vitest'
import { renderCardHtml } from './html'

describe('inert Markdown card documents', () => {
  it.each([
    ['**粗体** *斜体* ~~删除~~ ***组合***', ['<strong>粗体</strong>', '<em>斜体</em>', '<s>删除</s>', '<strong>组合</strong>']],
    ['# 标题\n\n- 第一项\n  - 子项\n\n3. 有序项', ['<h1>标题</h1>', '<ul>', '<li>子项</li>', '<ol start="3">']],
    ['> 引用  \n> 第二行\n\n---', ['<blockquote>', '引用<br>', '第二行', '<hr>']],
    ['`**literal**`\n\n```unknown\n  // **code**\n```', ['<code>**literal**</code>', '  // **code**', 'class="el-code-language">unknown']],
    ['| 名称 | 值 |\n| --- | --- |\n| 项目 | **el-bot** |', ['<table>', '<th>名称</th>', '<td><strong>el-bot</strong></td>']],
    ['[文档](https://example.com) ![说明](https://example.com/a.png)', ['class="el-markdown-link">文档', '[图片：说明]']],
    ['\\*literal\\* unmatched **', ['*literal* unmatched **']],
  ])('renders semantic Markdown while keeping input inert: %s', (body, fragments) => {
    for (const theme of ['light', 'dark'] as const) {
      const html = renderCardHtml({ title: 'Result', tone: 'success', details: { body, bodyFormat: 'markdown', footnote: '' } }, { theme })
      for (const fragment of fragments)
        expect(html).toContain(fragment)
      expect(html).not.toMatch(/<(?:a|img|script|iframe|svg)\b/)
      expect(html).toContain(`data-theme="${theme}"`)
    }
  })

  it('escapes HTML and configured fonts and keeps plain bodies literal', () => {
    const source = '<svg onload="alert(1)"><image href="file:///etc/passwd"/></svg>\n[run](javascript:alert(1))\n![remote](https://evil.example/image.svg)'
    const card = { title: '<script>', tone: 'danger' as const, details: { body: source, bodyFormat: 'markdown' as const, footnote: '' } }
    const html = renderCardHtml(card, { theme: 'dark', fontFamily: 'font";}</style><script>alert(1)</script>' })
    expect(html).toContain('&lt;svg onload=')
    expect(html).not.toMatch(/<(?:svg|script|img|image|a)\b/)
    expect(html).not.toContain('https://evil.example')
    expect(html).toContain('default-src \'none\'')
    expect(renderCardHtml({ ...card, details: { body: '**literal** `code`', footnote: '' } }, { theme: 'light' })).toContain('**literal** `code`')
  })
})
