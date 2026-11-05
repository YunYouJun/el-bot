import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

assert.equal(process.platform, 'darwin', 'Compile native macOS icons on macOS with Xcode 26 or later.')
const native = fileURLToPath(new URL('../src-tauri/', import.meta.url))
const output = join(native, 'target/icon-composer')
const catalog = join(output, 'Assets.car')
await mkdir(output, { recursive: true })
await rm(catalog, { force: true })
const args = [
  'actool',
  join(native, 'icons/ElBot.icon'),
  '--compile',
  output,
  '--platform',
  'macosx',
  '--target-device',
  'mac',
  '--minimum-deployment-target',
  '26.0',
  '--app-icon',
  'ElBot',
  '--include-all-app-icons',
  '--enable-on-demand-resources',
  'NO',
  '--output-partial-info-plist',
  join(output, 'partial.plist'),
  '--output-format',
  'human-readable-text',
  '--errors',
  '--warnings',
]
function compile() {
  return spawnSync('xcrun', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
  })
}
let result = compile()
// Xcode 27 may reuse a broken catalog helper. Recover only this known failure.
// https://github.com/tauri-apps/tauri/issues/16386
if (result.status !== 0 && /Bad file descriptor/.test(`${result.stdout}${result.stderr}`)) {
  console.warn('Restarting the current user\'s Xcode icon compiler helper after Bad file descriptor.')
  const restart = spawnSync('pkill', ['-u', String(process.getuid()), '-x', 'ibtoold'], { encoding: 'utf8' })
  if (restart.error || (restart.status !== 0 && restart.status !== 1))
    throw restart.error ?? new Error(restart.stderr || 'Failed to restart the Xcode icon compiler helper.')
  await new Promise(resolve => setTimeout(resolve, 250))
  result = compile()
}
if (result.status !== 0) {
  process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`)
  throw result.error ?? new Error('Failed to compile the native Liquid Glass icon.')
}
assert((await stat(catalog)).size > 0, 'actool must produce a nonempty Assets.car.')
console.log('Compiled native Liquid Glass icon into target/icon-composer/Assets.car.')
