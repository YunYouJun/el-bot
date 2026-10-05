import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const check = process.argv.includes('--check')
const require = createRequire(import.meta.url)
const cli = require.resolve('@tauri-apps/cli/tauri.js')
const source = await readFile(join(root, 'assets/brand/el-bot-mark.svg'), 'utf8')
assert.match(source, /viewBox="0 0 64 64"/)
const body = source.match(/<svg[^>]*>([\s\S]*?)<\/svg>\s*$/)?.[1].trim()
assert(body, 'Expected a canonical SVG mark.')
const color = body.match(/fill="(#[\dA-Fa-f]{6})"/)?.[1]
assert(color, 'Expected the mark to declare its brand color.')
const foreground = body.replaceAll(color, '#FFFFFF')
const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n  <rect width="64" height="64" fill="${color}"/>\n  ${foreground}\n</svg>\n`
const macIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><clipPath id="mac-mask"><rect x="4" y="4" width="56" height="56" rx="12.5"/></clipPath></defs><g clip-path="url(#mac-mask)"><g transform="translate(4 4) scale(.875)"><rect width="64" height="64" fill="${color}"/>${foreground}</g></g></svg>`
const trayIcon = source.replaceAll(color, '#000000')
function render(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render()
}

function canonicalIcns(data) {
  assert.equal(data.toString('ascii', 0, 4), 'icns')
  assert.equal(data.readUInt32BE(4), data.length)
  const chunks = []
  for (let offset = 8; offset < data.length;) {
    const length = data.readUInt32BE(offset + 4)
    assert(length >= 8 && offset + length <= data.length)
    chunks.push(data.subarray(offset, offset + length))
    offset += length
  }
  // The encoder iterates icon families in random order; ICNS has no positional offsets.
  chunks.sort((a, b) => Buffer.compare(a.subarray(0, 4), b.subarray(0, 4)))
  return Buffer.concat([data.subarray(0, 8), ...chunks])
}

// Check source geometry at the smallest supported size before producing bundles.
for (const size of [16, 24, 32, 64]) {
  const mark = render(source, size)
  const full = render(appIcon, size)
  assert.equal(mark.width, size)
  assert.equal(mark.height, size)
  assert.equal(mark.pixels[3], 0, 'The mark canvas must remain transparent.')
  assert.equal(full.pixels[3], 255, 'The app icon must cover every corner.')
  assert.equal(full.pixels[(size * size - 1) * 4 + 3], 255)
}

const temporary = await mkdtemp(join(tmpdir(), 'el-bot-icons-'))
const outputs = new Map()
try {
  for (const [name, svg] of [['app', appIcon], ['mac', macIcon]]) {
    const input = join(temporary, `${name}.png`)
    await writeFile(input, render(svg, 1024).asPng())
    const result = spawnSync(process.execPath, [cli, 'icon', input, '--output', join(temporary, name)], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      encoding: 'utf8',
    })
    if (result.error || result.status !== 0)
      throw result.error ?? new Error(result.stderr || 'Tauri icon generation failed.')
  }
  outputs.set('assets/brand/el-bot-app-icon.svg', appIcon)
  outputs.set('apps/el-bot-client/public/favicon.svg', appIcon)
  outputs.set('docs/public/favicon.svg', appIcon)
  outputs.set('docs/public/brand/el-bot-mark.svg', source)
  outputs.set('docs/public/logo.png', render(source, 512).asPng())
  const manifest = JSON.parse(await readFile(join(root, 'docs/public/manifest.json'), 'utf8'))
  outputs.set('docs/public/manifest.json', `${JSON.stringify({ ...manifest, theme_color: color }, null, 2)}\n`)
  const icons = 'apps/el-bot-client/src-tauri/icons'
  outputs.set(`${icons}/icon.png`, await readFile(join(temporary, 'app/icon.png')))
  outputs.set(`${icons}/icon.ico`, await readFile(join(temporary, 'app/icon.ico')))
  outputs.set(`${icons}/icon.icns`, canonicalIcns(await readFile(join(temporary, 'mac/icon.icns'))))
  outputs.set(`${icons}/macos-icon.png`, render(macIcon, 512).asPng())
  const tray = render(trayIcon, 32)
  assert.equal(tray.pixels.length, 32 * 32 * 4)
  outputs.set(`${icons}/tray-icon.png`, tray.asPng())
  outputs.set(`${icons}/tray-icon.rgba`, tray.pixels)
  let mismatches = 0
  for (const [relative, content] of outputs) {
    const path = join(root, relative)
    if (check) {
      const existing = await readFile(path).catch(() => undefined)
      if (!existing?.equals(Buffer.from(content))) {
        console.error(`Out of sync: ${relative}`)
        mismatches++
      }
    }
    else {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, content)
    }
  }
  if (mismatches)
    process.exitCode = 1
  else console.log(check ? 'All brand assets match the canonical SVG.' : 'Generated unified brand and platform icons.')
}
finally {
  await rm(temporary, { recursive: true, force: true })
}
