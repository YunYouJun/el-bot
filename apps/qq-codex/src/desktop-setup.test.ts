import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readConfig } from './config'
import { configureDesktop } from './desktop-setup'

let directory: string
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'el-bot-desktop-setup-')))
  vi.stubEnv('CODEX_APP_TOOLS_PIPE_PATH', '')
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('desktop configuration', () => {
  it('preserves existing project, ownership and credentials without guessing the host pipe', async () => {
    const filename = join(directory, 'config.json')
    const server = join(directory, 'server.mjs')
    const original = { projects: { demo: directory }, ownerOpenId: 'bound-owner', model: 'model', management: { enabled: false, allowedMethods: [] } }
    await writeFile(filename, JSON.stringify(original))
    await writeFile(server, '// local fixture')
    const options = { server, threadId: 'dedicated-chat' }
    await expect(configureDesktop(filename, options)).rejects.toThrow('不会扫描或猜测')
    expect(JSON.parse(await readFile(filename, 'utf8'))).toEqual(original)
    await configureDesktop(filename, { ...options, pipePath: join(directory, 'explicit-host.sock') })
    const config = await readConfig(filename)
    expect(config).toMatchObject({ projects: original.projects, ownerOpenId: 'bound-owner', model: 'model', management: original.management, desktop: { server, threadId: 'dedicated-chat' } })
    await expect(configureDesktop(filename, { ...options, pipePath: join(directory, 'other.sock') })).rejects.toThrow('不会覆盖')
  })
})
