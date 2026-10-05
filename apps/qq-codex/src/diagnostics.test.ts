import type { DiagnosticOptions, RemoteConfig, RemoteState } from './types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diagnose, formatDiagnostics } from './diagnostics'

const protocol = vi.hoisted(() => ({ start: vi.fn(), close: vi.fn(), request: vi.fn(), token: vi.fn(), gateway: vi.fn() }))
vi.mock('@el-bot/codex', async (original) => {
  const actual = await original<typeof import('@el-bot/codex')>()
  return { ...actual, CodexClient: class {
    start = protocol.start
    close = protocol.close
    request = protocol.request
  } }
})
vi.mock('qq-sdk/official', async (original) => {
  const actual = await original<typeof import('qq-sdk/official')>()
  return { ...actual, QQBotClient: class {
    token = protocol.token
    gateway = protocol.gateway
  } }
})

let directory: string
let config: RemoteConfig
let options: DiagnosticOptions
let state: RemoteState
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'el-bot diagnostic '))
  vi.resetAllMocks()
  protocol.start.mockResolvedValue(undefined)
  protocol.close.mockResolvedValue(undefined)
  protocol.token.mockResolvedValue('private-token')
  protocol.gateway.mockResolvedValue('wss://gateway.example.invalid')
  config = { projects: { demo: directory }, defaultProject: 'demo', codexHome: directory, transport: 'websocket', webhookPort: 8788, sandbox: false, messageFormat: 'markdown' }
  options = {
    paths: { profile: 'personal', config: join(directory, 'config.json'), envFile: join(directory, 'credentials.env'), state: join(directory, 'state.json') },
    includeCodex: true,
    includeQQ: true,
    loadConfig: async () => config,
    loadCredentials: async () => ({ appId: 'app', secret: 'private-secret' }),
  }
  state = { version: 1, owner: 'private-owner', project: 'demo', threads: { demo: { id: 'private-thread', cwd: directory } }, seen: ['keep'], tasks: [] }
  await writeFile(options.paths.state, JSON.stringify(state))
  protocol.request.mockImplementation(async (method: string) => {
    switch (method) {
      case 'account/read': return { account: { type: 'chatgpt' } }
      case 'model/list': return { data: [{ model: 'supported', isDefault: true }] }
      case 'config/read': return { config: { model: 'supported' } }
      case 'thread/read': return { thread: { id: 'private-thread', cwd: directory } }
      case 'thread/list': return { data: [] }
      default: throw new Error('Unexpected model operation')
    }
  })
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('aggregate diagnostics', () => {
  it('checks QQ after an archived session failure and prints a scoped recovery command without changing state', async () => {
    const snapshot = await readFile(options.paths.state, 'utf8')
    protocol.request.mockImplementation(async (method: string) => ({
      'account/read': { account: { type: 'apiKey' } },
      'thread/read': { thread: { id: 'private-thread', cwd: directory } },
      'thread/list': { data: [{ id: 'private-thread' }] },
    })[method])
    const report = await diagnose(options)
    expect(report.ok).toBe(false)
    expect(report.checks.find(check => check.id === 'session:demo')).toMatchObject({ status: 'fail', actions: expect.arrayContaining([expect.stringContaining('--profile personal')]) })
    expect(report.checks.find(check => check.id === 'qq-gateway')?.status).toBe('pass')
    expect(formatDiagnostics(report)).toContain('recover --project demo')
    expect(formatDiagnostics(report)).toContain(`'${options.paths.state}'`)
    expect(await readFile(options.paths.state, 'utf8')).toBe(snapshot)
    for (const privateValue of ['private-secret', 'private-owner', 'private-thread'])
      expect(JSON.stringify(report)).not.toContain(privateValue)
  })

  it('continues account, session and QQ diagnostics independently when login metadata is missing', async () => {
    protocol.request.mockResolvedValueOnce({ account: null, requiresOpenaiAuth: true })
    const report = await diagnose(options)
    expect(report.checks.find(check => check.id === 'account-model')).toMatchObject({ status: 'fail', actions: expect.arrayContaining([expect.stringContaining('CODEX_HOME')]) })
    expect(report.checks.find(check => check.id === 'session:demo')?.status).toBe('pass')
    expect(protocol.gateway).toHaveBeenCalledOnce()
    expect(protocol.close).toHaveBeenCalledOnce()
    expect(protocol.request.mock.calls.some(([method]) => ['turn/start', 'thread/resume', 'thread/unarchive'].includes(method))).toBe(false)
  })

  it('blocks all connections on an instance mismatch and preserves ownership and result history', async () => {
    state.instance = { appId: 'another-app', sandbox: false, profile: 'personal', codexHome: directory }
    await writeFile(options.paths.state, JSON.stringify(state))
    const snapshot = await readFile(options.paths.state, 'utf8')
    const report = await diagnose(options)
    expect(report.checks.find(check => check.id === 'identity')?.status).toBe('fail')
    expect(protocol.start).not.toHaveBeenCalled()
    expect(protocol.token).not.toHaveBeenCalled()
    expect(await readFile(options.paths.state, 'utf8')).toBe(snapshot)
  })

  it('reports both a disconnected Codex and a QQ failure without forwarding raw errors', async () => {
    protocol.start.mockRejectedValue(new Error('private-secret /private/account'))
    protocol.token.mockRejectedValue(new Error('private-secret access_token'))
    const report = await diagnose(options)
    expect(report.checks.filter(check => check.status === 'fail').map(check => check.id)).toEqual(['codex', 'qq'])
    expect(protocol.close).toHaveBeenCalledOnce()
    expect(JSON.stringify(report)).not.toMatch(/private-secret|access_token|private\/account/)
  })

  it('checks local Codex when credentials are incomplete but never requests QQ or writes legacy metadata', async () => {
    options.loadCredentials = async () => {
      throw new Error('private-secret')
    }
    const report = await diagnose(options)
    expect(report.checks.find(check => check.id === 'credentials')?.status).toBe('fail')
    expect(report.checks.find(check => check.id === 'codex')?.status).toBe('pass')
    expect(report.checks.find(check => check.id === 'qq')?.status).toBe('skip')
    expect(protocol.token).not.toHaveBeenCalled()
    expect(JSON.parse(await readFile(options.paths.state, 'utf8')).instance).toBeUndefined()
  })

  it('returns parseable failure reports for invalid configuration without reading credentials or connecting', async () => {
    options.loadConfig = async () => {
      throw new Error('private-secret')
    }
    options.loadCredentials = vi.fn(options.loadCredentials)
    const report = await diagnose(options)
    expect(JSON.parse(JSON.stringify(report))).toMatchObject({ version: 1, ok: false, checks: [{ id: 'config', status: 'fail' }] })
    expect(options.loadCredentials).not.toHaveBeenCalled()
    expect(protocol.start).not.toHaveBeenCalled()
    expect(protocol.token).not.toHaveBeenCalled()
  })

  it('does not access QQ for local-only checks and succeeds without a saved session', async () => {
    options.includeQQ = false
    state.threads = {}
    await writeFile(options.paths.state, JSON.stringify(state))
    options.loadCredentials = vi.fn(options.loadCredentials)
    expect((await diagnose(options)).ok).toBe(true)
    expect(options.loadCredentials).not.toHaveBeenCalled()
    expect(protocol.token).not.toHaveBeenCalled()
    expect(protocol.request).not.toHaveBeenCalledWith('thread/read', expect.anything())
  })

  it('does not contact QQ when the configured owner differs from persisted ownership', async () => {
    config.ownerOpenId = 'different-owner'
    const report = await diagnose(options)
    expect(report.checks.find(check => check.id === 'state')?.status).toBe('fail')
    expect(report.checks.find(check => check.id === 'sessions')?.status).toBe('skip')
    expect(protocol.token).not.toHaveBeenCalled()
  })
})
