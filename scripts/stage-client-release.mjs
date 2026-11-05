import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const extensions = { dmg: '.dmg', nsis: '.exe', archive: '.tar.gz', deb: '.deb' }
const targets = {
  'macos-arm64': { target: 'darwin/arm64', bundles: ['dmg'] },
  'macos-x64': { target: 'darwin/amd64', bundles: ['dmg'] },
  'windows-x64': { target: 'windows/amd64', bundles: ['nsis'] },
  'linux-arm64': { target: 'linux/arm64', bundles: ['archive', 'deb'] },
  'linux-x64': { target: 'linux/amd64', bundles: ['archive', 'deb'] },
}

export async function stageClientRelease(target, label, bundles, root = process.cwd()) {
  assert.deepEqual({ target, bundles: bundles.split(',') }, targets[label], 'Unknown or mismatched desktop target')
  const app = path.join(root, 'apps/el-bot-client')
  const config = JSON.parse(await readFile(path.join(app, 'mygo.json'), 'utf8'))
  const manifest = JSON.parse(await readFile(path.join(app, 'package.json'), 'utf8'))
  assert.equal(config.version, manifest.version, 'Client manifest and MyGo versions must match')
  assert.match(config.version, /^\d+\.\d+\.\d+(?:-[0-9A-Z.-]+)?$/i)
  const output = path.join(root, `dist/desktop-${label}`)
  await mkdir(output, { recursive: true })
  const checksums = []
  for (const bundle of targets[label].bundles) {
    const sourceDir = path.join(app, 'build', target.replace('/', '-'))
    const files = (await readdir(sourceDir)).filter(file => file.endsWith(extensions[bundle]) && (bundle !== 'nsis' || file.startsWith('yun-bot-setup-')))
    assert.equal(files.length, 1, `Expected one ${bundle} installer in ${sourceDir}`)
    const source = path.join(sourceDir, files[0])
    assert(files[0].includes(`_${config.version}_`) || files[0].includes(`-${config.version}-`), 'Installer filename must include the client version')
    assert((await stat(source)).size > 0, 'Installer must not be empty')
    const filename = `yun-bot_${config.version}_${label}${extensions[bundle]}`
    const destination = path.join(output, filename)
    await copyFile(source, destination)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(destination))
      hash.update(chunk)
    checksums.push(`${hash.digest('hex')}  ${filename}`)
  }
  await writeFile(path.join(output, `SHA256SUMS-${label}.txt`), `${checksums.join('\n')}\n`)
  return output
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [target, label, bundles] = process.argv.slice(2)
  assert(target && label && bundles, 'Usage: node scripts/stage-client-release.mjs <target> <label> <bundles>')
  console.log(await stageClientRelease(target, label, bundles))
}
