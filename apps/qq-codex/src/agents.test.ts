import type { QQBotClient } from 'qq-sdk/official'
import type { RemoteConfig, RemoteState } from './types'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { AcpClient } from '@el-bot/codex'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readConfig } from './config'
import { RemoteController } from './controller'
import { initialize } from './init'
import { resolvePaths } from './paths'
import { bindInstance, StateStore } from './store'

const controllers: RemoteController[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(controllers.splice(0).map(controller => controller.close()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
function state(): RemoteState {
  return { version: 1, owner: 'owner', project: 'demo', seen: [], threads: {}, tasks: [] }
}

describe('codeBuddy and dsh integration', () => {
  it.each(['codebuddy', 'dsh'] as const)('runs %s tasks through owner checks, dedup and QQ approval', async (provider) => {
    const cwd = await realpath(process.cwd())
    const config: RemoteConfig = { agent: provider, projects: { demo: cwd }, defaultProject: 'demo', transport: 'websocket', webhookPort: 8788, sandbox: false, messageFormat: 'text' }
    const client = new AcpClient({ provider, executable: process.execPath, args: [fileURLToPath(new URL('../../../packages/codex/test/fixtures/acp.mjs', import.meta.url))], projects: [cwd] })
    const saved = state()
    const qq = { reply: vi.fn<QQBotClient['reply']>(async () => ({})) }
    const controller = new RemoteController(config, saved, qq, client, async () => {}, vi.fn())
    controllers.push(controller)
    await client.start()
    let sequence = 0
    const send = (content: string, owner = 'owner', id = String(++sequence)) => controller.accept({ id, content, author: { user_openid: owner }, timestamp: new Date().toISOString() })
    await send('edit', 'stranger')
    expect(saved.tasks).toHaveLength(0)
    await send('edit', 'owner', 'task-message')
    await vi.waitFor(() => expect(qq.reply.mock.calls.some(call => typeof call[2] === 'string' && call[2].includes('/approve '))).toBe(true))
    const detail = qq.reply.mock.calls.map(call => typeof call[2] === 'string' ? call[2] : '').find(text => text.includes('/approve '))!
    const token = /\/approve (\w+)/.exec(detail)![1]
    const pageCount = Number(/\(1\/(\d+)\)/.exec(detail)![1])
    expect(detail).toContain('src/index.ts')
    await send('edit', 'owner', 'task-message')
    await send('another task')
    expect(saved.tasks).toHaveLength(1)
    await send(`/approve ${token}`, 'stranger')
    expect(saved.tasks[0].status).toBe('running')
    for (let page = 2; page <= pageCount; page++)
      await send(`/approval ${token} ${page}`)
    await send(`/approve ${token}`)
    await vi.waitFor(() => expect(saved.tasks[0].status).toBe('completed'))
    expect(saved.tasks[0].output).toBe('你好\napproved:once')
    await send('/rpc session/prompt {}')
    expect(saved.tasks).toHaveLength(1)
    await send('wait')
    await vi.waitFor(() => expect(saved.tasks[1].status).toBe('running'))
    await send('/stop')
    await vi.waitFor(() => expect(saved.tasks[1].status).toBe('interrupted'))
    expect(saved.threads.demo.cwd).toBe(cwd)
    await send('error')
    await vi.waitFor(() => expect(saved.tasks[2].status).toBe('failed'))
    expect(saved.tasks[2].output).toContain(provider === 'codebuddy' ? 'CodeBuddy' : 'dsh')
    expect(saved.tasks[2].output).not.toContain('Codex')
    expect(saved.tasks[2].output).not.toContain('private-secret')
  })

  it('keeps existing state from being adopted by a different program', () => {
    const saved = state()
    const codex = { appId: 'app', sandbox: false, codexHome: '/codex' }
    bindInstance(saved, codex)
    expect(() => bindInstance(saved, { appId: 'app', sandbox: false, agent: 'dsh', agentExecutable: 'dsh' })).toThrow('其他程序')
    expect(saved.instance).toEqual(codex)
    const legacy = state()
    legacy.threads.demo = { id: 'codex-session', cwd: '/demo' }
    expect(() => bindInstance(legacy, { appId: 'app', sandbox: false, agent: 'codebuddy' })).toThrow('旧状态')
  })

  it('initializes ACP profiles without Codex home settings and rejects mixed configuration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'el-agents-'))
    directories.push(directory)
    const paths = resolvePaths({ profile: 'codebuddy' }, directory, directory)
    await initialize(paths, { agent: 'codebuddy', project: directory, name: 'demo', prompt: false })
    expect(await readConfig(paths.config)).toMatchObject({ agent: 'codebuddy', codexHome: undefined })
    for (const extra of [{ agent: 'shell' }, { codexHome: '/codex' }, { management: { enabled: true } }, { desktop: {} }, { agentEnvAllowlist: ['QQ_BOT_SECRET'] }]) {
      await writeFile(paths.config, JSON.stringify({ agent: 'codebuddy', projects: { demo: directory }, ...extra }))
      await expect(readConfig(paths.config)).rejects.toThrow()
    }
  })

  it('rejects non-string agent names in configuration and persisted identities', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'el-agent-validation-'))
    directories.push(directory)
    const configPath = join(directory, 'config.json')
    const statePath = join(directory, 'state.json')
    const store = new StateStore(statePath)
    for (const agent of [['codex'], ['codebuddy'], ['dsh'], null, {}]) {
      await writeFile(configPath, JSON.stringify({ agent, projects: { demo: directory } }))
      await expect(readConfig(configPath)).rejects.toThrow('agent must be')
      await writeFile(statePath, JSON.stringify({ ...state(), instance: { appId: 'app', sandbox: false, agent } }))
      await expect(store.load('demo')).rejects.toThrow('Invalid state file')
    }
  })
})
