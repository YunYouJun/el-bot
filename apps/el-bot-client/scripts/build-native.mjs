import { spawnSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

await import('./build-macos-native.mjs')

const directory = fileURLToPath(new URL('..', import.meta.url))
for (const file of ['icon.png', 'tray-icon.png'])
  copyFileSync(new URL(`../icons/${file}`, import.meta.url), new URL(`../resources/${file === 'tray-icon.png' ? 'tray.png' : file}`, import.meta.url))
const result = spawnSync('go', ['tool', 'mygo', 'build', ...process.argv.slice(2)], { cwd: directory, stdio: 'inherit' })
if (result.error)
  throw result.error
process.exitCode = result.status ?? 1
