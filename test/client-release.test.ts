import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stageClientRelease } from '../scripts/stage-client-release.mjs'

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'el-bot-client-release-'))
  const app = path.join(root, 'apps/el-bot-client')
  await mkdir(path.join(app, 'src-tauri'), { recursive: true })
  await writeFile(path.join(app, 'package.json'), JSON.stringify({ version: '0.1.0' }))
  await writeFile(path.join(app, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '0.1.0' }))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function installer(target: string, bundle: string, filename: string, content = 'abc') {
  const directory = path.join(root, 'apps/el-bot-client/src-tauri/target', target, 'release/bundle', bundle)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, filename), content)
}

describe('desktop release artifacts', () => {
  it.each([
    ['aarch64-apple-darwin', 'macos-arm64', 'dmg', ['.dmg']],
    ['x86_64-apple-darwin', 'macos-x64', 'dmg', ['.dmg']],
    ['x86_64-pc-windows-msvc', 'windows-x64', 'nsis', ['.exe']],
    ['aarch64-unknown-linux-gnu', 'linux-arm64', 'appimage,deb', ['.AppImage', '.deb']],
    ['x86_64-unknown-linux-gnu', 'linux-x64', 'appimage,deb', ['.AppImage', '.deb']],
  ])('stages %s installers with distinct names and known SHA-256 checksums', async (target, label, bundles, extensions) => {
    const formats = (bundles as string).split(',')
    for (const [index, bundle] of formats.entries())
      await installer(target as string, bundle, `el-bot Client_0.1.0_test${extensions[index]}`)
    const output = await stageClientRelease(target, label, bundles, root)
    const names = (extensions as string[]).map(extension => `el-bot-client_0.1.0_${label}${extension}`)
    expect((await readdir(output)).sort()).toEqual([...names, `SHA256SUMS-${label}.txt`].sort())
    for (const name of names)
      expect(await readFile(path.join(output, name), 'utf8')).toBe('abc')
    const checksum = await readFile(path.join(output, `SHA256SUMS-${label}.txt`), 'utf8')
    expect(checksum).toBe(`${names.map(name => `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  ${name}`).join('\n')}\n`)
  })

  it('rejects target mismatches and unknown formats before writing output', async () => {
    await expect(stageClientRelease('x86_64-apple-darwin', 'macos-arm64', 'dmg', root)).rejects.toThrow('mismatched')
    await expect(stageClientRelease('aarch64-apple-darwin', 'macos-arm64', 'exe', root)).rejects.toThrow('mismatched')
    await expect(readdir(path.join(root, 'dist'))).rejects.toThrow()
  })

  it('rejects mismatched manifest versions', async () => {
    await writeFile(path.join(root, 'apps/el-bot-client/package.json'), JSON.stringify({ version: '0.2.0' }))
    await expect(stageClientRelease('aarch64-apple-darwin', 'macos-arm64', 'dmg', root)).rejects.toThrow('versions must match')
  })

  it.each([
    ['old version', 'el-bot Client_0.0.9_arm64.dmg', 'abc', 'client version'],
    ['empty installer', 'el-bot Client_0.1.0_arm64.dmg', '', 'not be empty'],
  ])('rejects an %s', async (_, filename, content, error) => {
    await installer('aarch64-apple-darwin', 'dmg', filename, content)
    await expect(stageClientRelease('aarch64-apple-darwin', 'macos-arm64', 'dmg', root)).rejects.toThrow(error)
  })

  it('rejects ambiguous installers instead of uploading an arbitrary file', async () => {
    await installer('aarch64-apple-darwin', 'dmg', 'el-bot Client_0.1.0_arm64.dmg')
    await installer('aarch64-apple-darwin', 'dmg', 'el-bot Client_0.0.9_arm64.dmg')
    await expect(stageClientRelease('aarch64-apple-darwin', 'macos-arm64', 'dmg', root)).rejects.toThrow('Expected one dmg installer')
  })
})
