import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const check = args.includes('--check')
const source = args.find(arg => !arg.startsWith('--'))
if (!source) {
  console.error('Usage: node scripts/sync-design-agent.mjs <design-repository> [--check]')
  process.exit(1)
}

const destination = fileURLToPath(new URL('../apps/el-bot-client/src/components/ui/', import.meta.url))
const payload = JSON.parse(await readFile(resolve(source, 'packages/public/r/ylf-agent.json'), 'utf8'))
const names = ['agent.ts', 'YlfAgentStatus.vue', 'YlfAgentCard.vue', 'YlfAgentTask.vue']
if (payload.name !== 'ylf-agent' || payload.files?.length !== names.length)
  throw new Error('Expected the YunLeFun ylf-agent Registry item. Run pnpm registry:build in design first.')

const files = await Promise.all(names.map(async (name) => {
  const path = `packages/vue/components/${name}`
  const entry = payload.files.find(file => file.path === path)
  const canonical = await readFile(resolve(source, path), 'utf8')
  if (entry?.content !== canonical)
    throw new Error(`Registry is stale for ${name}. Run pnpm registry:build in design first.`)
  return { name, content: canonical }
}))
const license = await readFile(resolve(source, 'LICENSE'), 'utf8')
const manifest = {
  repository: 'https://github.com/YunLeFun/design',
  registry: 'ylf-agent',
  files: Object.fromEntries(files.map(file => [file.name, createHash('sha256').update(file.content).digest('hex')])),
}
files.push({ name: 'LICENSE', content: license }, { name: 'source.json', content: `${JSON.stringify(manifest, null, 2)}\n` })
if (!check)
  await mkdir(destination, { recursive: true })
let mismatches = 0
for (const file of files) {
  const path = resolve(destination, file.name)
  if (check) {
    const existing = await readFile(path, 'utf8').catch(() => undefined)
    if (existing !== file.content) {
      console.error(`Out of sync: ${file.name}`)
      mismatches++
    }
  }
  else {
    await writeFile(path, file.content)
  }
}
if (mismatches)
  process.exitCode = 1
else
  console.log(check ? 'YunLeFun agent components match canonical source.' : 'Synced YunLeFun agent components and MIT license.')
