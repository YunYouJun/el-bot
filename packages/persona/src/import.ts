import type { PersonaImport, PersonaSource } from './types'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { hasControlCharacters, MAX_CARD_BYTES } from './card'

const execute = promisify(execFile)

function httpsURL(input: string) {
  let url: URL
  try {
    url = new URL(input)
  }
  catch { throw new Error('请输入有效的 HTTPS 地址。') }
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048 || url.hash)
    throw new Error('仅支持不含凭据和片段的 HTTPS 地址。')
  return url
}

function decode(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch { throw new Error('人物卡必须使用 UTF-8 编码。') }
}

async function localFile(path: string) {
  const file = await open(path, 'r')
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > MAX_CARD_BYTES)
      throw new Error('请选择不超过 32 KiB 的人物卡文件。')
    const bytes = Buffer.alloc(MAX_CARD_BYTES + 1)
    let size = 0
    while (size < bytes.length) {
      const chunk = await file.read(bytes, size, bytes.length - size)
      if (!chunk.bytesRead)
        break
      size += chunk.bytesRead
    }
    if (size > MAX_CARD_BYTES)
      throw new Error('人物卡超过 32 KiB。')
    return decode(bytes.subarray(0, size))
  }
  finally { await file.close() }
}

async function download(input: string) {
  let url = httpsURL(input)
  const signal = AbortSignal.timeout(20000)
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal, headers: { Accept: 'text/markdown, text/plain' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location)
        throw new Error('人物卡链接缺少重定向目标。')
      url = httpsURL(new URL(location, url).href)
      continue
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error(`下载人物卡失败（HTTP ${response.status}）。`)
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done)
          break
        size += chunk.value.byteLength
        if (size > MAX_CARD_BYTES)
          throw new Error('人物卡超过 32 KiB。')
        chunks.push(chunk.value)
      }
    }
    finally { await reader.cancel() }
    return decode(Buffer.concat(chunks))
  }
  throw new Error('人物卡链接重定向次数过多。')
}

async function gitFile(request: Extract<PersonaImport, { kind: 'git' }>) {
  const { repository, path } = request
  if (!isAbsolute(repository)) {
    const url = httpsURL(repository)
    if (url.search)
      throw new Error('Git 仓库地址不能包含查询参数。')
  }
  if (!path || path.length > 512 || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || path.includes(':') || hasControlCharacters(path) || /[\t\r\n]/.test(path))
    throw new Error('请填写仓库内人物卡的相对文件路径。')
  const ref = request.ref || 'HEAD'
  if (!/^[\w./-]{1,200}$/.test(ref) || ref.startsWith('-'))
    throw new Error('Git ref 必须为分支、标签或提交 ID。')
  const directory = await mkdtemp(join(tmpdir(), 'el-persona-'))
  const emptyConfig = join(directory, 'empty.config')
  await writeFile(emptyConfig, '')
  // Do not inherit credentials, Git helpers, URL rewrites, or repository hooks.
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TMPDIR: process.env.TMPDIR, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig, GIT_TERMINAL_PROMPT: '0' }
  const git = async (args: string[], maxBuffer = 16384) => (await execute('git', ['-c', `core.hooksPath=${join(directory, 'hooks')}`, '-c', 'credential.helper=', '-c', 'protocol.ext.allow=never', '-c', 'protocol.file.allow=always', ...args], { cwd: directory, env, timeout: 20000, maxBuffer, encoding: 'utf8' })).stdout.trimEnd()
  try {
    await git(['init', '--bare', '--quiet'])
    await git(['fetch', '--quiet', '--depth=1', '--filter=blob:none', '--no-tags', '--', repository, ref])
    const commit = await git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'])
    const tree = await git(['ls-tree', commit, '--', path])
    if (!/^100(?:644|755) blob [a-f0-9]+\t/.test(tree))
      throw new Error('人物卡必须是 Git 仓库中的普通文件。')
    const size = Number(await git(['cat-file', '-s', `${commit}:${path}`]))
    if (!Number.isSafeInteger(size) || size > MAX_CARD_BYTES)
      throw new Error('人物卡超过 32 KiB。')
    const { stdout } = await execute('git', ['cat-file', 'blob', `${commit}:${path}`], { cwd: directory, env, timeout: 20000, maxBuffer: MAX_CARD_BYTES, encoding: 'buffer' })
    return { text: decode(stdout), source: { kind: 'git', repository, path, ref, commit } as const }
  }
  catch (error) {
    if (error instanceof Error && error.message.startsWith('人物卡'))
      throw error
    throw new Error('无法导入 Git 人物卡；请检查 Git 是否已安装、仓库是否公开，以及 ref 和文件路径是否正确。')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
}

/** Fetch only on explicit import/update; runtime reads immutable local snapshots. */
export async function importPersona(request: PersonaImport): Promise<{ text: string, filename: string, source: PersonaSource }> {
  if (request.kind === 'file') {
    const path = resolve(request.path)
    return { text: await localFile(path), filename: path, source: { kind: 'file', path } }
  }
  if (request.kind === 'url') {
    const url = httpsURL(request.url).href
    return { text: await download(url), filename: new URL(url).pathname, source: { kind: 'url', url } }
  }
  if (request.kind === 'git')
    return { ...await gitFile(request), filename: request.path }
  if (request.kind === 'text' && typeof request.text === 'string' && typeof request.name === 'string' && request.name.length <= 256)
    return { text: request.text, filename: request.name, source: { kind: 'text', name: request.name } }
  throw new Error('不支持的人物卡来源。')
}
