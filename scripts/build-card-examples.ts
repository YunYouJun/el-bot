import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { cardExamples } from '../apps/qq-codex/src/card-renderer/examples'
import { renderCardHtml } from '../apps/qq-codex/src/card-renderer/html'

const directory = new URL('../docs/public/card-renderer/', import.meta.url)
await mkdir(directory, { recursive: true })
for (const example of cardExamples) {
  for (const theme of ['light', 'dark'] as const)
    await writeFile(new URL(`${example.id}-${theme}.html`, directory), renderCardHtml(example.card, { theme }))
}
console.log(`Generated ${cardExamples.length * 2} card examples in ${fileURLToPath(directory)}`)
