import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const version = '0.4.0'
export const appDirectory = fileURLToPath(new URL('..', import.meta.url))
const executable = process.platform === 'win32' ? 'nsh.exe' : 'nsh'

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: appDirectory, stdio: 'inherit', ...options })
  if (result.error)
    throw result.error
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status})`)
}

export async function ensureNsh() {
  const destination = join(appDirectory, '.nsh/toolchain')
  const candidates = [process.env.YUN_NSH_BIN, join(destination, 'nsh/bin', executable), join(destination, 'source/bin', executable)].filter(Boolean)
  for (const candidate of candidates) {
    try {
      await access(candidate)
    }
    catch { continue }
    const output = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
    if (output.status === 0 && new RegExp(`^nsh ${version.replaceAll('.', '\\.')}\\b`).test(output.stdout))
      return candidate
    throw new Error(`Expected nsh ${version}: ${candidate}`)
  }
  await mkdir(destination, { recursive: true })
  const archives = { 'darwin-arm64': 'nsh-macos-arm64.tar.gz', 'win32-x64': 'nsh-windows-x86_64.zip', 'linux-x64': 'nsh-linux-x86_64.tar.gz' }
  const archive = archives[`${process.platform}-${process.arch}`]
  if (!archive) {
    // Intel Macs and Linux ARM have no official binary distribution.
    run('cargo', ['install', 'nsh-cli', '--version', version, '--locked', '--root', join(destination, 'source')])
    return join(destination, 'source/bin', executable)
  }
  const base = `https://github.com/longbridge/nsh/releases/download/v${version}/${archive}`
  const target = join(destination, archive)
  console.log(`Installing official nsh ${version} for ${process.platform}/${process.arch}…`)
  const checksum = await fetch(`${base}.sha256`).then(async (response) => {
    if (!response.ok)
      throw new Error(`Could not download nsh checksum: ${response.status}`)
    return (await response.text()).trim().split(/\s+/)[0]
  })
  const response = await fetch(base)
  if (!response.ok)
    throw new Error(`Could not download nsh: ${response.status}`)
  const { Readable } = await import('node:stream')
  const { pipeline } = await import('node:stream/promises')
  const { createWriteStream } = await import('node:fs')
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target))
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(target)) hash.update(chunk)
  if (hash.digest('hex') !== checksum) {
    await rm(target)
    throw new Error('NSH distribution checksum mismatch')
  }
  if (process.platform === 'win32')
    run('tar', ['-xf', target, '-C', destination])
  else run('tar', ['-xzf', target, '-C', destination])
  await rm(target)
  const bin = join(destination, 'nsh/bin', executable)
  await access(bin)
  return bin
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const binary = await ensureNsh()
  run(binary, process.argv.slice(2))
}
