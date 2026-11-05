import { describe, expect, it } from 'vitest'
import { renderPersonaPreview } from '../web/persona-preview'

describe('untrusted character card preview', () => {
  it('renders Markdown while preventing HTML execution, image requests and active links', () => {
    const result = renderPersonaPreview('# 小云\n<script>alert(1)</script>\n![cloud](https://example.com/track.png)\n[link](javascript:alert(1))\n[safe](https://example.com)')
    expect(result).toContain('<h1>小云</h1>')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('<img')
    expect(result).not.toContain('<a ')
    expect(result).toContain('&lt;script&gt;')
  })
})
