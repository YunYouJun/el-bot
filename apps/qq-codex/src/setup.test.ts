import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import consola from 'consola'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readConfig } from './config'
import { readCredentials } from './credentials'
import { initialize } from './init'
import { resolvePaths } from './paths'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'qq-codex-setup-'))
  for (const key of ['QQ_BOT_APP_ID', 'QQ_BOT_SECRET', 'QQ_BOT_APP_SECRET'])
    vi.stubEnv(key, '')
  vi.spyOn(consola, 'info').mockImplementation(() => {})
  vi.spyOn(consola, 'success').mockImplementation(() => {})
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

describe('cLI configuration and credentials', () => {
  it('initializes private, usable files without leaking credentials or resetting existing setup', async () => {
    const paths = resolvePaths({}, directory, directory)
    vi.stubEnv('QQ_BOT_APP_ID', '12345')
    vi.stubEnv('QQ_BOT_SECRET', 'test-secret')
    await initialize(paths, { project: directory, name: 'demo', prompt: false })
    const config = await readConfig(paths.config)
    expect(config.projects.demo).toBe(await realpath(directory))
    expect(config.messageFormat).toBe('markdown')
    expect(await readCredentials(paths.envFile, true, {})).toEqual({ appId: '12345', secret: 'test-secret' })
    expect(JSON.stringify(vi.mocked(consola.info).mock.calls)).not.toContain('test-secret')
    expect(await readFile(paths.config, 'utf8')).not.toContain('test-secret')
    if (process.platform !== 'win32') {
      expect((await stat(paths.envFile)).mode & 0o777).toBe(0o600)
      expect((await stat(paths.config)).mode & 0o777).toBe(0o600)
    }
    await writeFile(paths.state, 'keep-owner')
    await expect(initialize(paths, { project: directory, prompt: false })).rejects.toThrow('配置已存在')
    expect(await readFile(paths.state, 'utf8')).toBe('keep-owner')
    expect((await readCredentials(paths.envFile, true, {})).secret).toBe('test-secret')
  })

  it('reuses an explicit credentials file and does not touch its contents', async () => {
    const envFile = join(directory, 'existing.env')
    await writeFile(envFile, 'QQ_BOT_APP_ID=app\nQQ_BOT_APP_SECRET=legacy-secret\n')
    const paths = resolvePaths({ envFile }, directory, directory)
    await initialize(paths, { project: directory, prompt: false })
    expect(await readCredentials(envFile, true, {})).toEqual({ appId: 'app', secret: 'legacy-secret' })
    expect(await readFile(envFile, 'utf8')).toContain('QQ_BOT_APP_SECRET=legacy-secret')
  })

  it('rejects bad projects and dotenv injection before creating files', async () => {
    const paths = resolvePaths({}, directory, directory)
    await expect(initialize(paths, { project: join(directory, 'missing'), prompt: false })).rejects.toThrow()
    await expect(stat(paths.config)).rejects.toMatchObject({ code: 'ENOENT' })
    vi.stubEnv('QQ_BOT_SECRET', 'secret\nINJECTED=value')
    await expect(initialize(paths, { project: directory, prompt: false })).rejects.toThrow('换行')
    await expect(stat(paths.envFile)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('pins explicit credentials to the selected file and rejects mixed sources', async () => {
    const envFile = join(directory, 'credentials.env')
    const legacy = join(directory, '.env')
    await writeFile(envFile, 'QQ_BOT_APP_ID=file-app\nQQ_BOT_SECRET=file-secret\n')
    await writeFile(legacy, 'QQ_BOT_APP_ID=legacy-app\nQQ_BOT_SECRET=legacy-secret\n')
    expect(await readCredentials(envFile, true, { QQ_BOT_APP_ID: 'env-app', QQ_BOT_SECRET: 'env-secret' }, legacy)).toEqual({ appId: 'file-app', secret: 'file-secret' })
    expect(await readCredentials(envFile, false, { QQ_BOT_APP_ID: 'env-app', QQ_BOT_SECRET: 'env-secret' }, legacy)).toEqual({ appId: 'env-app', secret: 'env-secret' })
    await expect(readCredentials(envFile, false, { QQ_BOT_APP_ID: 'env-app' }, legacy)).rejects.toThrow('同一个凭据来源')
    expect(await readCredentials(envFile, false, {}, legacy)).toEqual({ appId: 'file-app', secret: 'file-secret' })
    await expect(readCredentials(join(directory, 'missing'), true, {}, legacy)).rejects.toThrow('无法读取凭据')
    expect(await readCredentials(join(directory, 'missing'), false, {}, legacy)).toEqual({ appId: 'legacy-app', secret: 'legacy-secret' })
  })

  it('isolates profile files and Codex storage without adopting a project dotenv file', async () => {
    const first = resolvePaths({ profile: 'personal' }, directory, directory)
    const second = resolvePaths({ profile: 'test' }, directory, directory)
    expect(first.config).not.toBe(second.config)
    expect(first.state).not.toBe(second.state)
    expect(first.envFile).not.toBe(second.envFile)
    expect(first.codexHome).not.toBe(second.codexHome)
    await initialize(first, { project: directory, prompt: false })
    expect((await readConfig(first.config)).codexHome).toBe(first.codexHome)
    expect((await stat(first.codexHome!)).isDirectory()).toBe(true)
    await expect(readCredentials(first.envFile, true, { QQ_BOT_APP_ID: 'ambient', QQ_BOT_SECRET: 'ambient-secret' })).rejects.toThrow('缺少')
    for (const profile of ['../other', '/tmp', '', 'Prod', 'a'.repeat(65)])
      expect(() => resolvePaths({ profile }, directory, directory)).toThrow('profile')
  })

  it('supports legacy project config discovery and explicit path overrides', async () => {
    const home = join(directory, 'home')
    const defaultPaths = resolvePaths({}, directory, home)
    expect(defaultPaths.config).toBe(join(home, '.el-bot/qq-codex.json'))
    await mkdir(join(directory, '.el-bot'))
    await writeFile(join(directory, '.el-bot/qq-codex.json'), '{}')
    expect(resolvePaths({}, directory, home).config).toBe(join(directory, '.el-bot/qq-codex.json'))
    expect(resolvePaths({ config: 'custom.json', envFile: 'custom.env', state: 'custom-state.json' }, directory, home)).toEqual({ config: join(directory, 'custom.json'), envFile: join(directory, 'custom.env'), state: join(directory, 'custom-state.json') })
  })

  it('does not include malformed configuration contents in errors', async () => {
    const config = join(directory, 'bad.json')
    await writeFile(config, 'private-secret-is-not-json')
    const error = await readConfig(config).catch(error => error as Error)
    if (!(error instanceof Error))
      throw new Error('Malformed configuration unexpectedly succeeded')
    expect(error.message).toContain('JSON')
    expect(error.message).not.toContain('private-secret')
  })

  it('defaults legacy configurations to Markdown and allows an explicit text mode', async () => {
    const config = join(directory, 'config.json')
    const base = { projects: { demo: directory }, defaultProject: 'demo' }
    await writeFile(config, JSON.stringify(base))
    expect((await readConfig(config)).messageFormat).toBe('markdown')
    await writeFile(config, JSON.stringify({ ...base, messageFormat: 'text' }))
    expect((await readConfig(config)).messageFormat).toBe('text')
    await writeFile(config, JSON.stringify({ ...base, messageFormat: 'html' }))
    await expect(readConfig(config)).rejects.toThrow('messageFormat')
  })
})
