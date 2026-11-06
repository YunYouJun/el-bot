import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

assert.equal(process.platform, 'darwin', 'Inspect macOS icon resources on macOS.')
assert(process.argv[2], 'Usage: node scripts/check-macos-icon.mjs <app-bundle>')
const bundle = resolve(process.argv[2])
const resources = join(bundle, 'Contents/Resources')
const plist = join(bundle, 'Contents/Info.plist')
const plistValue = key => execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim()
const name = plistValue('CFBundleIconName')
assert(name, 'The bundle must reference its compiled layered icon.')
const assets = JSON.parse(execFileSync('xcrun', ['assetutil', '--info', join(resources, 'Assets.car')], { encoding: 'utf8' }))
const stacks = assets.filter(asset => asset.AssetType === 'IconImageStack' && asset.Name === name)
for (const appearance of ['NSAppearanceNameAqua', 'NSAppearanceNameDarkAqua', 'ISAppearanceTintable']) {
  const stack = stacks.find(asset => asset.Appearance === appearance)
  assert(stack, `Missing layered ${appearance} icon.`)
  assert(stack.LayerCount >= 2, 'The icon must retain separate background and foreground layers.')
  assert(stack.Layers.some(layer => layer.LayerHasSpecular), 'The icon must retain native glass lighting.')
}
assert(assets.some(asset => asset.AssetType === 'Vector' && asset.Name.endsWith('/cloud')), 'Missing vector cloud artwork.')
const fallback = await readFile(join(resources, plistValue('CFBundleIconFile')))
const expectedFallback = await readFile(fileURLToPath(new URL('../icons/icon.icns', import.meta.url)))
assert(fallback.equals(expectedFallback), 'The static fallback must match the generated 72% icon.')
console.log(`Verified ${name}: layered default, dark and tinted icons, native glass lighting and unchanged ICNS fallback.`)
