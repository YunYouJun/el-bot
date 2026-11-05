import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_CARD_BYTES, parsePersona, personaPrompt } from './card'
import { importPersona } from './import'
import { PersonaLibrary } from './library'

const directories: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'persona-test-'))
  directories.push(directory)
  return { directory, library: new PersonaLibrary(join(directory, 'cards')) }
}
const first = '---\nid: cloud\nname: 小云\nlicense: CC-BY-NC-SA-4.0\npermissions: dangerous\n---\n# 小云\n元气，爱代码。\n'

describe('portable character cards', () => {
  it('accepts plain Markdown and whitelists optional metadata without promoting permissions', () => {
    const parsed = parsePersona(first, 'cloud.md')
    expect(parsed.metadata).toEqual({ id: 'cloud', name: '小云', license: 'CC-BY-NC-SA-4.0' })
    expect(parsed.body).toBe('# 小云\n元气，爱代码。\n')
    expect(parsePersona('# Plain\nhello', 'plain.md').metadata).toEqual({ id: 'plain', name: 'Plain' })
    expect(parsePersona('# Plain\nhello', 'plain.markdown').metadata.id).toBe('plain')
    expect(personaPrompt('/run work', parsed)).toContain('Current user task:\n/run work')
    expect(personaPrompt('original')).toBe('original')
  })
  it('rejects oversized, empty, HTML and malformed cards', () => {
    for (const text of ['', '---\nname: missing', '---\nname: [broken\n---\nbody', '<!doctype html><html>login', '\0', 'x'.repeat(MAX_CARD_BYTES + 1)])
      expect(() => parsePersona(text, 'cloud.md')).toThrow()
    expect(() => parsePersona('---\nid: ../escape\n---\nbody', 'cloud.md')).toThrow('id')
  })
  it('imports a local file and detects changes to pinned snapshots', async () => {
    const { directory, library } = await fixture()
    const path = join(directory, 'cloud.md')
    await writeFile(path, first)
    const card = await library.import({ kind: 'file', path })
    await library.select('cloud')
    expect((await library.active())?.body).toContain('元气')
    await writeFile(join(library.directory, `${card.hash}.md`), 'tampered')
    await expect(library.active()).rejects.toThrow('校验失败')
    await library.import({ kind: 'file', path })
    expect((await library.active())?.hash).toBe(card.hash)
    await writeFile(path, 'x'.repeat(MAX_CARD_BYTES + 1))
    await expect(library.import({ kind: 'file', path })).rejects.toThrow('32 KiB')
  })
  it('keeps updates pending until enabled, supports rollback, and isolates selections', async () => {
    const { directory, library } = await fixture()
    const other = new PersonaLibrary(join(directory, 'other-bot'))
    expect(await library.list()).toEqual({ version: 1, cards: [] })
    await expect(stat(library.directory)).rejects.toMatchObject({ code: 'ENOENT' })
    const path = join(directory, 'cloud.md')
    await writeFile(path, first)
    const a = await library.import({ kind: 'file', path })
    expect(await library.active()).toBeUndefined()
    await library.select('cloud')
    await writeFile(path, first.replace('元气', '安静'))
    const b = await library.update('cloud')
    expect((await library.active())?.hash).toBe(a.hash)
    await library.select('cloud', b.hash)
    expect((await library.active())?.body).toContain('安静')
    await library.select('cloud', a.hash)
    expect((await library.active())?.hash).toBe(a.hash)
    expect(await other.active()).toBeUndefined()
    await library.select(null)
    expect(await library.active()).toBeUndefined()
    if (process.platform !== 'win32')
      expect((await stat(join(library.directory, 'index.json'))).mode & 0o777).toBe(0o600)
  })
  it('refuses concurrent writes and corrupt indexes without silently clearing selection', async () => {
    const { library } = await fixture()
    await library.import({ kind: 'text', name: 'cloud.md', text: first })
    await writeFile(join(library.directory, 'write.lock'), '')
    await expect(library.select('cloud')).rejects.toThrow('正在保存')
    await rm(join(library.directory, 'write.lock'))
    await writeFile(join(library.directory, 'index.json'), '{broken')
    await expect(library.select(null)).rejects.toThrow('目录损坏')
    expect(await readFile(join(library.directory, 'index.json'), 'utf8')).toBe('{broken')
  })
  it('retains an enabled old revision across bounded update history', async () => {
    const { library } = await fixture()
    const old = await library.import({ kind: 'text', name: 'cloud.md', text: first })
    await library.select('cloud')
    for (let i = 0; i < 22; i++)
      await library.import({ kind: 'text', name: 'cloud.md', text: `${first}\n${i}` })
    expect((await library.list()).cards[0].revisions).toHaveLength(20)
    expect((await readdir(library.directory)).filter(path => path.endsWith('.md'))).toHaveLength(20)
    expect((await library.active())?.hash).toBe(old.hash)
  })
})

describe('online and Git imports', () => {
  it('follows HTTPS redirects, records the source and works offline after import', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://cards.example/raw.md' } })).mockResolvedValueOnce(new Response(first))
    vi.stubGlobal('fetch', fetcher)
    const { library } = await fixture()
    const card = await library.import({ kind: 'url', url: 'https://cards.example/cloud.md' })
    expect(card.source).toEqual({ kind: 'url', url: 'https://cards.example/cloud.md' })
    await library.select('cloud')
    fetcher.mockRejectedValue(new Error('offline'))
    expect((await library.active())?.hash).toBe(card.hash)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('rejects credentials, insecure redirects, invalid UTF-8 and oversized streams', async () => {
    await expect(importPersona({ kind: 'url', url: 'https://user:password@example.com/card.md' })).rejects.toThrow('凭据')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://example.com/card.md' } })))
    await expect(importPersona({ kind: 'url', url: 'https://example.com/card.md' })).rejects.toThrow('HTTPS')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([255]))))
    await expect(importPersona({ kind: 'url', url: 'https://example.com/card.md' })).rejects.toThrow('UTF-8')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(MAX_CARD_BYTES + 1))))
    await expect(importPersona({ kind: 'url', url: 'https://example.com/card.md' })).rejects.toThrow('32 KiB')
  })
  it('imports a selected Git ref without checkout and rejects traversal and symlinks', async () => {
    const { directory, library } = await fixture()
    const repository = join(directory, 'repo')
    await mkdir(repository)
    const git = (args: string[]) => promisify(execFile)('git', args, { cwd: repository })
    await git(['init', '--quiet'])
    await writeFile(join(repository, 'cloud.md'), first)
    if (process.platform !== 'win32')
      await symlink('cloud.md', join(repository, 'link.md'))
    await git(['add', '.'])
    await git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'test: add card'])
    const commit = (await git(['rev-parse', 'HEAD'])).stdout.trim()
    const card = await library.import({ kind: 'git', repository, path: 'cloud.md', ref: commit })
    expect(card.source).toMatchObject({ kind: 'git', commit, ref: commit })
    expect((await library.preview('cloud')).body).toContain('元气')
    await expect(library.import({ kind: 'git', repository, path: '../cloud.md' })).rejects.toThrow('相对文件路径')
    await expect(library.import({ kind: 'git', repository, path: 'cloud.md', ref: '--upload-pack=bad' })).rejects.toThrow('ref')
    if (process.platform !== 'win32')
      await expect(library.import({ kind: 'git', repository, path: 'link.md' })).rejects.toThrow('普通文件')
  })
})
