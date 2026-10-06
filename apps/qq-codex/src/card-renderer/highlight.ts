import type { HighlighterCore } from 'shiki/core'
import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import bash from 'shiki/langs/bash.mjs'
import cpp from 'shiki/langs/cpp.mjs'
import csharp from 'shiki/langs/csharp.mjs'
import go from 'shiki/langs/go.mjs'
import java from 'shiki/langs/java.mjs'
import jsonc from 'shiki/langs/jsonc.mjs'
import jsx from 'shiki/langs/jsx.mjs'
import python from 'shiki/langs/python.mjs'
import rust from 'shiki/langs/rust.mjs'
import sql from 'shiki/langs/sql.mjs'
import tsx from 'shiki/langs/tsx.mjs'
import vue from 'shiki/langs/vue.mjs'
import xml from 'shiki/langs/xml.mjs'
import yaml from 'shiki/langs/yaml.mjs'
import dark from 'shiki/themes/github-dark-default.mjs'
import light from 'shiki/themes/github-light.mjs'

let highlighter: HighlighterCore | undefined

export interface CodeRun {
  text: string
  code: true
  syntaxColor?: string
}

/** Tokenize local grammars and themes without HTML, Wasm or runtime downloads. */
export function codeRuns(source: string, language: string | undefined, theme: 'light' | 'dark'): CodeRun[] {
  const plain: CodeRun[] = [{ text: source, code: true }]
  if (!language || source.length > 12000)
    return plain
  try {
    highlighter ??= createHighlighterCoreSync({
      engine: createJavaScriptRegexEngine({ target: 'ES2024', forgiving: true }),
      langs: [bash, cpp, csharp, go, java, jsonc, jsx, python, rust, sql, tsx, vue, xml, yaml],
      themes: [dark, light],
    })
    const lang = language.toLowerCase()
    if (!highlighter.getLoadedLanguages().includes(lang))
      return plain
    const { tokens } = highlighter.codeToTokens(source, { lang, theme: theme === 'dark' ? 'github-dark-default' : 'github-light' })
    const runs: CodeRun[] = []
    for (const [line, row] of tokens.entries()) {
      if (line)
        runs.push({ text: '\n', code: true })
      for (const token of row) {
        runs.push({
          text: token.content,
          code: true,
          syntaxColor: token.color && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(token.color) ? token.color : undefined,
        })
      }
    }
    // Keep the original code even if tokenization ever skips an unsupported fragment.
    return runs.map(run => run.text).join('') === source ? runs : plain
  }
  catch {
    return plain
  }
}
