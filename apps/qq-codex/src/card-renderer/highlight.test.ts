import { describe, expect, it } from 'vitest'
import { codeRuns } from './highlight'
import { renderCardHtml } from './html'

describe('local code syntax highlighting', () => {
  it.each(['light', 'dark'] as const)('distinguishes keywords, strings, numbers and comments in %s cards', (theme) => {
    const source = 'const message: string = "中文👩‍💻";\n// keep this comment\nconst count = 42'
    const runs = codeRuns(source, 'ts', theme)
    expect(runs.map(run => run.text).join('')).toBe(source)
    expect(new Set(runs.map(run => run.syntaxColor).filter(Boolean)).size).toBeGreaterThanOrEqual(4)
  })

  it.each([
    ['TS', 'const ok: boolean = true'],
    ['js', 'const ok = "yes"'],
    ['tsx', 'const App = () => <div title="hello" />'],
    ['jsx', 'const App = () => <div title="hello" />'],
    ['json', '{ "enabled": true, "count": 42 }'],
    ['jsonc', '{ "enabled": true /* comment */ }'],
    ['bash', 'echo "hello" # comment'],
    ['sh', 'echo "hello" # comment'],
    ['py', 'def hello():\n  return "hello"'],
    ['yml', 'name: "hello"\nenabled: true'],
    ['html', '<div title="hello">world</div>'],
    ['css', '.card { color: red; }'],
    ['vue', '<template><div>Hello</div></template>'],
    ['sql', 'SELECT name FROM users WHERE id = 42'],
    ['go', 'package main\nfunc main() { println("hi") }'],
    ['rust', 'fn main() { let ok = true; }'],
    ['java', 'class Demo { private int count = 42; }'],
    ['csharp', 'class Demo { private int count = 42; }'],
    ['cpp', 'int main() { return 42; }'],
  ])('supports %s without fetching language data', (language, source) => {
    const runs = codeRuns(source, language, 'dark')
    expect(runs.map(run => run.text).join('')).toBe(source)
    expect(new Set(runs.map(run => run.syntaxColor).filter(Boolean)).size).toBeGreaterThanOrEqual(2)
  })

  it('keeps blank lines, tabs and unsafe-looking code lossless and falls back for unknown languages', () => {
    const source = '\n\tconst html = "<svg onload=alert(1)>"\n\n'
    expect(codeRuns(source, 'ts', 'dark').map(run => run.text).join('')).toBe(source)
    for (const language of [undefined, '', 'plain', 'unsupported', 'https://evil.example/grammar'])
      expect(codeRuns(source, language, 'dark')).toEqual([{ text: source, code: true }])
    expect(codeRuns('x'.repeat(12001), 'ts', 'dark')).toEqual([{ text: 'x'.repeat(12001), code: true }])
  })

  it('renders syntax colors into escaped HTML without executing code', () => {
    const output = '```ts\nconst html = "<script>alert(1)</script>"\n// comment\n```'
    const card = { title: 'Result', tone: 'success' as const, details: { body: output, bodyFormat: 'markdown' as const, footnote: '' } }
    const fills = (html: string) => [...html.matchAll(/<span style="color:(#[\da-f]+)"/gi)].map(match => match[1])
    const light = renderCardHtml(card, { theme: 'light' })
    const dark = renderCardHtml(card, { theme: 'dark' })
    expect(new Set(fills(light)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(fills(dark)).size).toBeGreaterThanOrEqual(3)
    expect(fills(light)).not.toEqual(fills(dark))
    for (const html of [light, dark]) {
      expect(html).toContain('&lt;script&gt;')
      expect(html).not.toMatch(/<(?:script|image|foreignObject)\b/)
      expect(html).toContain('class="el-code-language">ts')
    }
    expect(card.details.body).toBe(output)
  })
})
