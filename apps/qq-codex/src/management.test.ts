import type { CodexClient, CodexDesktopClient } from '@el-bot/codex'
import type { RemoteConfig, ReplyContext } from './types'
import { EventEmitter } from 'node:events'
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { setImmediate } from 'node:timers/promises'
import { CodexSchema } from '@el-bot/codex'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManagementController, redact } from './management'

let directory: string
const managers: ManagementController[] = []
beforeEach(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'el-bot-management-')))
})
afterEach(async () => {
  await Promise.all(managers.splice(0).map(manager => manager.close()))
  await rm(directory, { recursive: true, force: true })
})

function setup() {
  const config: RemoteConfig = { projects: { demo: directory }, defaultProject: 'demo', transport: 'websocket', webhookPort: 8788, sandbox: false, messageFormat: 'text', management: { enabled: true, allowedMethods: [] } }
  const methods = ['thread/list', 'thread/read', 'thread/archive', 'config/value/write', 'fs/readFile', 'project/newApi', 'turn/start']
  const schema = new CodexSchema({ oneOf: methods.map(method => ({ type: 'object', properties: { id: { type: 'number' }, method: { enum: [method] }, params: { type: 'object' } }, required: ['method', 'params', 'id'] })), definitions: {} })
  const codex = Object.assign(new EventEmitter(), { request: vi.fn(async (_method: string, _params: unknown) => ({ thread: { id: 'thread', cwd: directory }, apiKey: 'secret-value' })) })
  const desktop = { tool: vi.fn(async (name: string) => ({ name })), assert: vi.fn(async () => {}), call: vi.fn(async () => ({})), close: vi.fn(async () => {}) }
  let active = false
  const replies: string[] = []
  const say = vi.fn(async (_reply: ReplyContext, text: string) => {
    replies.push(text)
    return true
  })
  const manager = new ManagementController(config, codex as unknown as CodexClient, schema, desktop as unknown as CodexDesktopClient, () => 'demo', () => active, say)
  managers.push(manager)
  const reply = {} as ReplyContext
  const send = async (text: string) => {
    const [command, ...args] = text.split(/\s+/)
    const before = replies.length
    expect(manager.accept(command, args, reply, text)).toBe(true)
    await vi.waitFor(() => expect(replies.length).toBeGreaterThan(before))
    // Give the asynchronous finalizer a chance to release admission.
    await setImmediate()
  }
  const token = () => replies.at(-1)!.match(/待确认管理请求 (\w+)/)![1]
  return {
    manager,
    config,
    codex,
    desktop,
    replies,
    say,
    send,
    token,
    active: (value: boolean) => {
      active = value
    },
  }
}

describe('remote API and desktop management', () => {
  it('uses versioned discovery and requires confirmation for unknown future methods', async () => {
    const s = setup()
    await s.send('/api project/')
    expect(s.replies.at(-1)).toContain('project/newApi')
    await s.send('/rpc project/newApi {"name":"review"}')
    const id = s.token()
    expect(s.codex.request).not.toHaveBeenCalled()
    expect(s.manager.busy).toBe(true)
    await s.send(`/confirm ${id}`)
    expect(s.codex.request).toHaveBeenCalledExactlyOnceWith('project/newApi', { name: 'review' })
    await s.send(`/confirm ${id}`)
    expect(s.codex.request).toHaveBeenCalledOnce()
    expect(s.replies.join('\n')).not.toContain('secret-value')
  })

  it('requires all successfully delivered pages before confirming', async () => {
    const s = setup()
    s.say.mockImplementationOnce(async (_reply, text) => {
      s.replies.push(text)
      return false
    })
    await s.send(`/rpc project/newApi ${JSON.stringify({ name: 'long '.repeat(500) })}`)
    const id = s.token()
    const count = Number(s.replies.at(-1)!.match(/\(1\/(\d+)\)/)![1])
    await s.send(`/confirm ${id}`)
    expect(s.codex.request).not.toHaveBeenCalled()
    for (let page = 1; page <= count; page++)
      await s.send(`/inspect ${id} ${page}`)
    await s.send(`/confirm ${id}`)
    expect(s.codex.request).toHaveBeenCalledOnce()
  })

  it('blocks arbitrary project paths, symlinks, implicit command policy and task bypasses', async () => {
    const s = setup()
    await symlink(tmpdir(), join(directory, 'outside'), process.platform === 'win32' ? 'junction' : 'dir')
    for (const text of [
      `/rpc fs/readFile ${JSON.stringify({ path: join(directory, 'outside', 'private.txt') })}`,
      '/rpc fs/readFile {"path":"../private"}',
      '/rpc config/value/write {"keyPath":"approval_policy","value":"never"}',
      '/rpc turn/start {"threadId":"thread"}',
    ]) {
      await s.send(text)
      expect(s.replies.at(-1)).toContain('管理操作未完成')
    }
    expect(s.codex.request).not.toHaveBeenCalled()
  })

  it('scopes thread browsing to the current project and checks target threads', async () => {
    const s = setup()
    await s.send('/threads')
    expect(s.codex.request).toHaveBeenCalledWith('thread/list', { cwd: directory })
    s.codex.request.mockResolvedValueOnce({ thread: { id: 'outside', cwd: tmpdir() }, apiKey: '' })
    await s.send('/rpc thread/archive {"threadId":"outside"}')
    expect(s.replies.at(-1)).toContain('管理操作未完成')
    expect(s.codex.request).not.toHaveBeenCalledWith('thread/archive', expect.anything())
  })

  it('admits only one operation and refuses mutation while a task runs', async () => {
    const s = setup()
    s.active(true)
    await s.send('/rpc project/newApi {}')
    expect(s.manager.busy).toBe(false)
    s.active(false)
    await s.send('/rpc project/newApi {}')
    const id = s.token()
    await s.send('/rpc project/newApi {}')
    expect(s.replies.at(-1)).toContain('已有任务或待确认')
    await s.send(`/cancel ${id}`)
    await s.send(`/confirm ${id}`)
    expect(s.codex.request).not.toHaveBeenCalled()
  })

  it('stages every desktop mutation and passes the original reviewed arguments once', async () => {
    const s = setup()
    await s.send('/desktop projects')
    expect(s.desktop.call).toHaveBeenCalledWith('list_projects', {})
    s.desktop.call.mockClear()
    await s.send('/desktop call set_thread_title {"threadId":"chat","title":"Reviewed  title"}')
    const id = s.token()
    expect(s.desktop.call).not.toHaveBeenCalled()
    await s.send(`/confirm ${id}`)
    expect(s.desktop.call).toHaveBeenCalledExactlyOnceWith('set_thread_title', { threadId: 'chat', title: 'Reviewed  title' })
  })

  it('redacts credentials embedded in MCP JSON text and events', () => {
    expect(JSON.stringify(redact({ content: [{ text: JSON.stringify({ apiKey: 'sk-hidden', directory: '/Users/private/repo' }) }] }))).not.toContain('sk-hidden')
    expect(redact({ authorization: 'secret', env: { key: 'secret' }, path: '/home/private/repo' })).toEqual({ authorization: '[已隐藏]', env: '[已隐藏]', path: '[本机路径]' })
  })
})
