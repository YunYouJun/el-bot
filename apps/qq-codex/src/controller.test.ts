import type { QQBotClient } from 'qq-sdk/official'
import type { RemoteConfig, RemoteState } from './types'
import { setImmediate } from 'node:timers/promises'
import { CodexClient, CodexSchema } from '@el-bot/codex'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardPages } from './cards'
import { RemoteController } from './controller'

function replyText(payload: Parameters<QQBotClient['reply']>[2]): string {
  return typeof payload === 'string' ? payload : 'markdown' in payload ? payload.markdown.content.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code))) : ''
}

function buttonCommands(payload: Parameters<QQBotClient['reply']>[2]): string[] {
  return typeof payload === 'string' ? [] : payload.keyboard?.content?.rows.flatMap(row => row.buttons.map(button => button.action.data)) ?? []
}

class FakeCodex extends CodexClient {
  override request = vi.fn(async (method: string, params: unknown) => {
    const input = params as Record<string, unknown>
    return (method === 'thread/read' ? { thread: { id: input.threadId, cwd: input.threadId === 'other-saved' ? '/other' : '/demo' } } : { data: [], nextCursor: null }) as never
  })

  override thread = vi.fn(async () => 'thread')
  override turn = vi.fn(async () => ({ turn: { id: 'turn' } }))
  override interrupt = vi.fn(async () => ({}))
  override steer = vi.fn(async () => ({}))
  override forkThread = vi.fn(async () => 'forked')
  override review = vi.fn(async () => ({ turn: { id: 'review' } }))
  override respond = vi.fn()
  override reject = vi.fn()
  override close = vi.fn(async () => {})
}
const controllers: RemoteController[] = []
afterEach(async () => {
  await Promise.all(
    controllers.splice(0).map(controller => controller.close()),
  )
})
function setup(owner: string | undefined = 'owner', schema?: CodexSchema) {
  const config: RemoteConfig = {
    projects: { demo: '/demo', other: '/other' },
    defaultProject: 'demo',
    transport: 'websocket',
    webhookPort: 8788,
    sandbox: false,
    messageFormat: 'markdown',
  }
  const state: RemoteState = {
    version: 1,
    owner,
    project: 'demo',
    seen: [],
    threads: {},
    tasks: [],
  }
  const codex = new FakeCodex()
  const qq = { reply: vi.fn<QQBotClient['reply']>(async () => ({})) }
  const saved: string[] = []
  const save = vi.fn(async (state: RemoteState) => {
    saved.push(JSON.stringify(state))
  })
  const controller = new RemoteController(
    config,
    state,
    qq,
    codex,
    save,
    vi.fn(),
    { schema },
  )
  controllers.push(controller)
  let sequence = 0
  const message = (
    content: string,
    sender = 'owner',
    id = String(++sequence),
  ) => ({
    id,
    content,
    author: { user_openid: sender },
    timestamp: new Date().toISOString(),
  })
  const send = (content: string, sender?: string, id?: string) =>
    controller.accept(message(content, sender, id))
  const start = async () => {
    await send('fix tests')
    await vi.waitFor(() => expect(state.tasks.at(-1)?.status).toBe('running'))
  }
  return {
    config,
    state,
    codex,
    qq,
    save,
    saved,
    controller,
    send,
    message,
    start,
  }
}

describe('remote admission and sessions', () => {
  it('refuses busy shutdown, blocks queued work after admission closes and persists interruption once', async () => {
    const s = setup()
    await s.start()
    await expect(s.controller.prepareStop(false)).rejects.toThrow('仍有任务')
    expect(s.codex.close).not.toHaveBeenCalled()
    await s.controller.prepareStop(true)
    await s.send('must not create another task')
    const first = s.controller.close()
    expect(s.controller.close()).toBe(first)
    await first
    expect(s.codex.close).toHaveBeenCalledOnce()
    expect(s.state.tasks).toHaveLength(1)
    expect(s.state.tasks[0].status).toBe('interrupted')
    expect(s.saved.at(-1)).toContain('interrupted')
  })

  it('routes image help parts and their buttons without admitting a model task', async () => {
    const s = setup()
    s.config.messageFormat = 'image'
    await s.send('/help 1 2', 'stranger')
    expect(s.qq.reply).not.toHaveBeenCalled()
    await s.send('/help 1 2')
    await vi.waitFor(() => expect(s.qq.reply).toHaveBeenCalledOnce())
    expect(replyText(s.qq.reply.mock.calls[0][2])).toContain('/result [任务ID] [页码]')
    expect(replyText(s.qq.reply.mock.calls[0][2])).not.toContain('/review [目标JSON]')
    expect(buttonCommands(s.qq.reply.mock.calls[0][2])).toContain('/help 2')
    await s.send('/help 2')
    await vi.waitFor(() => expect(s.qq.reply).toHaveBeenCalledTimes(2))
    expect(buttonCommands(s.qq.reply.mock.calls[1][2])).toContain('/help 2 2')
    await s.send('/help 1 99')
    await vi.waitFor(() => expect(s.qq.reply).toHaveBeenCalledTimes(3))
    expect(replyText(s.qq.reply.mock.calls[2][2])).toContain('帮助页码无效')
    expect(s.codex.turn).not.toHaveBeenCalled()
    expect(s.codex.thread).not.toHaveBeenCalled()
    expect(s.state.tasks).toHaveLength(0)
  })

  it('sends C2C-compatible buttons and authorizes their commands on the server', async () => {
    const s = setup()
    await s.send('/help')
    await vi.waitFor(() => expect(s.qq.reply).toHaveBeenCalledOnce())
    const payload = s.qq.reply.mock.calls[0][2]
    expect(typeof payload).toBe('object')
    if (typeof payload === 'string')
      throw new Error('Expected a help card with buttons')
    const buttons = payload.keyboard!.content!.rows.flatMap(row => row.buttons)
    // C2C OpenIDs are not client-side specify_user_ids; ownership is checked on receipt.
    for (const button of buttons)
      expect(button.action.permission).toEqual({ type: 2 })
    const select = buttons.find(button => button.action.data === '/projects')!
    await s.send(select.action.data, 'stranger')
    expect(s.qq.reply).toHaveBeenCalledOnce()
    expect(s.state.seen).toHaveLength(1)
    await s.send(select.action.data)
    await vi.waitFor(() => expect(s.qq.reply).toHaveBeenCalledTimes(2))
    const switchProject = buttonCommands(s.qq.reply.mock.calls[1][2]).find(command => command === '/project other')!
    expect(switchProject).toBe('/project other')
    await s.send(switchProject, 'stranger')
    expect(s.state.project).toBe('demo')
    await s.send(switchProject)
    expect(s.state.project).toBe('other')
    expect(s.codex.turn).not.toHaveBeenCalled()
  })

  it('diagnoses archived sessions without model work and resets only the named project', async () => {
    const s = setup()
    s.state.threads.demo = { id: 'saved', cwd: '/demo' }
    s.state.threads.other = { id: 'other-saved', cwd: '/other' }
    s.codex.request.mockResolvedValueOnce({ thread: { id: 'saved', cwd: '/demo' } } as never)
      .mockResolvedValueOnce({ data: [{ id: 'saved' }], nextCursor: null } as never)
    await s.send('/diagnose')
    await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('已归档'))
    expect(s.codex.thread).not.toHaveBeenCalled()
    expect(s.codex.turn).not.toHaveBeenCalled()
    expect(s.state.threads.demo.id).toBe('saved')
    await s.send('/new other', 'stranger')
    expect(s.state.threads.other.id).toBe('other-saved')
    await s.send('/new other')
    expect(s.state.project).toBe('demo')
    expect(s.state.threads.demo.id).toBe('saved')
    expect(s.state.threads.other).toBeUndefined()
  })

  it('checks archived sessions before resuming or starting a turn', async () => {
    const s = setup()
    s.state.threads.demo = { id: 'saved', cwd: '/demo' }
    s.codex.request.mockResolvedValueOnce({ thread: { id: 'saved', cwd: '/demo' } } as never)
      .mockResolvedValueOnce({ data: [{ id: 'saved' }], nextCursor: null } as never)
    await s.send('/run verify')
    await vi.waitFor(() => expect(s.state.tasks[0]?.failure).toBe('session-archived'))
    expect(s.codex.thread).not.toHaveBeenCalled()
    expect(s.codex.turn).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(buttonCommands(s.qq.reply.mock.calls.at(-1)![2])).toContain('/new demo'))
  })
  it('applies owner checks, durable dedup and task exclusion to management confirmations', async () => {
    const schema = new CodexSchema({ oneOf: [{ type: 'object', properties: { id: { type: 'number' }, method: { enum: ['project/update'] }, params: { type: 'object' } }, required: ['method', 'id', 'params'] }], definitions: {} })
    const s = setup('owner', schema)
    const request = vi.spyOn(s.codex, 'request').mockResolvedValue({} as never)
    await s.send('/rpc project/update {}', 'stranger')
    expect(s.qq.reply).not.toHaveBeenCalled()
    await s.send('/rpc project/update {}', 'owner', 'stage')
    await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('待确认管理请求'))
    const id = replyText(s.qq.reply.mock.calls.at(-1)![2]).match(/待确认管理请求 (\w+)/)![1]
    await setImmediate()
    await s.send('work while awaiting confirmation')
    expect(s.codex.thread).not.toHaveBeenCalled()
    await s.send(`/confirm ${id}`, 'stranger')
    expect(request).not.toHaveBeenCalled()
    await s.send(`/confirm ${id}`, 'owner', 'confirm')
    await s.send(`/confirm ${id}`, 'owner', 'confirm')
    await vi.waitFor(() => expect(request).toHaveBeenCalledExactlyOnceWith('project/update', {}))
    expect(s.saved.some(snapshot => snapshot.includes('owner:confirm'))).toBe(true)
  })

  it('steers only the matching running turn and forks only when task admission is free', async () => {
    const s = setup()
    await s.send('/steer too early')
    expect(s.codex.steer).not.toHaveBeenCalled()
    s.state.threads.demo = { id: 'saved', cwd: '/demo' }
    await s.send('/thread fork')
    expect(s.state.threads.demo).toEqual({ id: 'forked', cwd: '/demo' })
    await s.start()
    await s.send('/thread fork')
    expect(s.codex.forkThread).toHaveBeenCalledOnce()
    await s.send('/steer Preserve  whitespace', 'stranger')
    expect(s.codex.steer).not.toHaveBeenCalled()
    await s.send('/steer Preserve  whitespace')
    expect(s.codex.steer).toHaveBeenCalledExactlyOnceWith('thread', 'turn', 'Preserve  whitespace')
    expect(s.codex.turn).toHaveBeenCalledOnce()
  })

  it('reviews within standard task admission and stores the final review item', async () => {
    const s = setup()
    await s.send('/review {"type":"baseBranch"}')
    expect(s.codex.review).not.toHaveBeenCalled()
    await s.send('/review')
    await vi.waitFor(() => expect(s.state.tasks.at(-1)?.status).toBe('running'))
    expect(s.codex.review).toHaveBeenCalledExactlyOnceWith('thread', { type: 'uncommittedChanges' })
    expect(s.codex.turn).not.toHaveBeenCalled()
    await s.send('/review')
    expect(s.codex.review).toHaveBeenCalledOnce()
    s.codex.emit('notification', { method: 'item/completed', params: { threadId: 'thread', turnId: 'review', item: { id: 'review-output', type: 'exitedReviewMode', review: 'Review findings' } } })
    s.codex.emit('notification', { method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'review', status: 'completed' } } })
    await vi.waitFor(() => expect(s.state.tasks[0].status).toBe('completed'))
    expect(s.state.tasks[0].output).toBe('Review findings')
  })
  it('shows a shortcut menu for help aliases and unknown commands without creating tasks', async () => {
    const s = setup()
    for (const command of ['/help', '/menu', '/?', '/帮助', '/菜单', '帮助', '菜单', '/unknown']) {
      await s.send(command)
      await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('Codex 快捷命令'))
      expect(buttonCommands(s.qq.reply.mock.calls.at(-1)![2])).toContain('/projects')
    }
    await s.send('/menu 3')
    await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('审批与回答'))
    await s.send('/help 99')
    await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('帮助页码无效'))
    expect(s.state.tasks).toEqual([])
    expect(s.codex.thread).not.toHaveBeenCalled()
    const before = s.qq.reply.mock.calls.length
    await s.send('/help', 'stranger')
    expect(s.qq.reply.mock.calls.length).toBe(before)
  })

  it('keeps help and project browsing available during tasks and after disconnect', async () => {
    const s = setup()
    await s.start()
    await s.send('/menu')
    await vi.waitFor(() => expect(buttonCommands(s.qq.reply.mock.calls.at(-1)![2])).toContain('/projects'))
    await s.send('/projects')
    await vi.waitFor(() => expect(buttonCommands(s.qq.reply.mock.calls.at(-1)![2])).toContain('/project other'))
    expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).not.toContain('/other')
    await s.send('/project other')
    expect(s.state.project).toBe('demo')
    await s.send('/new')
    expect(s.state.threads.demo.id).toBe('thread')
    s.codex.emit('disconnect', new Error('closed'))
    await s.send('/help 2')
    await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('项目与会话'))
    expect(s.codex.turn).toHaveBeenCalledOnce()
  })

  it('keeps Chinese prompts starting with a help word as task input', async () => {
    const s = setup()
    await s.send('帮助 修复测试')
    await vi.waitFor(() => expect(s.codex.turn).toHaveBeenCalledWith('thread', '/demo', '帮助 修复测试', undefined))
  })

  it('binds only with the local secret, rejects other owners and ignores duplicate prompts', async () => {
    const s = setup(undefined)
    // Explicit undefined invokes the helper default; remove it for pairing.
    delete s.state.owner
    await s.send('fix everything', 'stranger')
    await s.send('/pair incorrect', 'stranger')
    expect(s.codex.turn).not.toHaveBeenCalled()
    await s.send(`/pair ${s.controller.pairingCode}`)
    expect(s.state.owner).toBe('owner')
    await s.send('fix everything', 'stranger')
    await s.send('hello', 'owner', 'duplicate')
    await s.send('hello', 'owner', 'duplicate')
    await vi.waitFor(() => expect(s.codex.turn).toHaveBeenCalledOnce())
    expect(s.saved.some(text => text.includes('owner:duplicate'))).toBe(true)
  })

  it('refuses stale prompts and project traversal', async () => {
    const s = setup()
    await s.controller.accept({
      ...s.message('hello'),
      timestamp: '2020-01-01T00:00:00Z',
    })
    await s.send('/project ../../private')
    expect(s.state.project).toBe('demo')
    expect(s.codex.thread).not.toHaveBeenCalled()
  })

  it('keeps status and stop responsive, rejects parallel work and waits for completion', async () => {
    const s = setup()
    let confirm!: (value: object) => void
    s.codex.interrupt.mockImplementationOnce(() => new Promise((resolve) => {
      confirm = resolve
    }))
    await s.start()
    await s.send('another task')
    await s.send('/status')
    await s.send('/stop')
    expect(s.codex.turn).toHaveBeenCalledOnce()
    expect(s.codex.interrupt).toHaveBeenCalledWith('thread', 'turn', [])
    expect(s.state.tasks[0].status).toBe('running')
    s.codex.emit('notification', {
      method: 'turn/completed',
      params: {
        threadId: 'thread',
        turn: { id: 'turn', status: 'interrupted' },
      },
    })
    expect(s.state.tasks[0].status).toBe('running')
    await s.send('work before terminal termination')
    expect(s.codex.turn).toHaveBeenCalledOnce()
    confirm({})
    await vi.waitFor(() => expect(s.state.tasks[0].status).toBe('interrupted'))
  })

  it('blocks new tasks and reports an unconfirmed stop when terminal cleanup fails', async () => {
    const s = setup()
    await s.start()
    s.codex.interrupt.mockRejectedValueOnce(new Error('private-path private-token'))
    await s.send('/stop')
    await vi.waitFor(() => expect(s.state.tasks[0].failure).toBe('stop-unconfirmed'))
    expect(s.state.tasks[0].status).toBe('failed')
    expect(s.state.tasks[0].output).not.toContain('private-token')
    await s.send('do not admit more work')
    expect(s.codex.turn).toHaveBeenCalledOnce()
  })

  it('includes command items arriving during cancellation and interrupts only once', async () => {
    const s = setup()
    await s.start()
    s.codex.emit('notification', { method: 'item/started', params: { threadId: 'thread', turnId: 'turn', item: { id: 'ours', type: 'commandExecution' } } })
    s.codex.interrupt.mockImplementationOnce(async () => {
      s.codex.emit('notification', { method: 'item/started', params: { threadId: 'thread', turnId: 'turn', item: { id: 'racing', type: 'commandExecution' } } })
      s.codex.emit('notification', { method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'interrupted' } } })
      return {}
    })
    await s.send('/stop')
    await vi.waitFor(() => expect(s.state.tasks[0].status).toBe('interrupted'))
    expect(s.codex.interrupt).toHaveBeenCalledOnce()
    expect(s.codex.interrupt).toHaveBeenCalledWith('thread', 'turn', ['ours', 'racing'])
  })

  it('cancels during thread startup without starting a turn', async () => {
    const s = setup()
    let release!: (value: string) => void
    s.codex.thread.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    await s.send('work')
    await s.send('/stop')
    release('thread')
    await vi.waitFor(() => expect(s.state.tasks[0].status).toBe('interrupted'))
    expect(s.codex.turn).not.toHaveBeenCalled()
  })

  it('handles completion notifications racing the turn/start response', async () => {
    const s = setup()
    s.codex.turn.mockImplementationOnce(async () => {
      s.codex.emit('notification', {
        method: 'turn/completed',
        params: {
          threadId: 'thread',
          turn: { id: 'fast', status: 'completed' },
        },
      })
      return { turn: { id: 'fast' } }
    })
    await s.send('quick task')
    await vi.waitFor(() => expect(s.state.tasks[0].status).toBe('completed'))
  })

  it('resumes per-project threads, /new discards only the current binding', async () => {
    const s = setup()
    s.state.threads.demo = { id: 'saved', cwd: '/demo' }
    s.state.threads.other = { id: 'other-saved', cwd: '/other' }
    await s.send('/new')
    expect(s.state.threads.demo).toBeUndefined()
    expect(s.state.threads.other.id).toBe('other-saved')
    await s.send('/project other')
    await s.start()
    expect(s.codex.thread).toHaveBeenCalledWith({
      cwd: '/other',
      threadId: 'other-saved',
      model: undefined,
    })
  })

  it('does not admit new work after Codex disconnects', async () => {
    const s = setup()
    await s.start()
    s.codex.emit('disconnect', new Error('closed'))
    await s.send('retry automatically')
    expect(s.state.tasks[0].status).toBe('failed')
    expect(s.codex.turn).toHaveBeenCalledOnce()
  })
})

describe('approval and result handling', () => {
  it('reports an expired Codex login from the failed turn instead of a generic task failure', async () => {
    const s = setup()
    await s.start()
    s.codex.emit('notification', { method: 'item/completed', params: { threadId: 'thread', turnId: 'turn', item: { id: 'partial', type: 'agentMessage', text: '已完成的部分结果' } } })
    s.codex.emit('notification', {
      method: 'turn/completed',
      params: {
        threadId: 'thread',
        turn: {
          id: 'turn',
          status: 'failed',
          error: {
            message: 'Your access token could not be refreshed because you have since logged out or signed in to another account. Please sign in again.',
            codexErrorInfo: 'unauthorized',
            additionalDetails: null,
          },
        },
      },
    })
    await vi.waitFor(() => expect(s.state.tasks[0].status).toBe('failed'))
    expect(s.state.tasks[0].output).toContain('登录已失效')
    expect(s.state.tasks[0].output).toContain('已完成的部分结果')
    expect(s.state.tasks[0].failure).toBe('authentication')
    expect(s.state.tasks[0].output).toContain('codex login')
    expect(s.state.tasks[0].output).toContain('不会自动重试')
    await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('登录已失效'))
  })

  it('keeps transient errors running and uses the matching terminal error when completion omits it', async () => {
    const s = setup()
    await s.start()
    s.codex.emit('notification', { method: 'error', params: { threadId: 'thread', turnId: 'turn', willRetry: true, error: { codexErrorInfo: 'rateLimitExceeded', message: 'private raw error' } } })
    expect(s.state.tasks[0].status).toBe('running')
    expect(s.state.tasks[0].failure).toBeUndefined()
    s.codex.emit('notification', { method: 'error', params: { threadId: 'thread', turnId: 'stale', willRetry: false, error: { codexErrorInfo: 'unauthorized' } } })
    s.codex.emit('notification', { method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'failed' } } })
    await vi.waitFor(() => expect(s.state.tasks[0].failure).toBe('rate-limit'))
    expect(s.state.tasks[0].output).not.toContain('private raw error')
    expect(s.state.tasks[0].output).not.toContain('登录已失效')
  })

  it('does not carry a recovered transient error into a completed task or the next task', async () => {
    const s = setup()
    await s.start()
    s.codex.emit('notification', { method: 'error', params: { threadId: 'thread', turnId: 'turn', willRetry: true, error: { codexErrorInfo: 'usageLimitExceeded' } } })
    s.codex.emit('notification', { method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'completed' } } })
    expect(s.state.tasks[0].failure).toBeUndefined()
    await s.start()
    s.codex.emit('notification', { method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'failed' } } })
    await vi.waitFor(() => expect(s.state.tasks[1].failure).toBe('unknown'))
  })

  it('explains an archived session without unarchiving it or automatically creating another', async () => {
    const s = setup()
    s.state.threads.demo = { id: 'archived', cwd: '/demo' }
    s.codex.thread.mockRejectedValueOnce(new Error('Codex RPC error -32600: session archived is archived.'))
    await s.send('continue work')
    await vi.waitFor(() => expect(s.state.tasks[0].failure).toBe('session-archived'))
    expect(s.state.tasks[0].output).toContain('/new')
    expect(s.state.threads.demo.id).toBe('archived')
    expect(s.codex.turn).not.toHaveBeenCalled()
  })

  it('ignores stale task buttons and rejects buttons sent by another user', async () => {
    const s = setup()
    await s.start()
    const first = s.state.tasks[0]
    s.codex.emit('notification', { method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'completed' } } })
    await s.start()
    const current = s.state.tasks.at(-1)!
    await s.send(`/stop ${first.id}`)
    await s.send(`/stop ${current.id}`, 'stranger')
    expect(s.codex.interrupt).not.toHaveBeenCalled()
    await s.send(`/stop ${current.id}`)
    expect(s.codex.interrupt).toHaveBeenCalledOnce()
  })

  it('never counts an undelivered approval page as reviewed', async () => {
    const s = setup()
    await s.start()
    s.qq.reply.mockRejectedValueOnce(new Error('Request timed out'))
    s.codex.emit('request', { id: 'request', method: 'item/commandExecution/requestApproval', params: { threadId: 'thread', turnId: 'turn', command: 'echo reviewed' } })
    await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('待审批'))
    const token = replyText(s.qq.reply.mock.calls.at(-1)![2]).match(/待审批 (\w+)/)![1]
    await s.send(`/approve ${token}`)
    expect(s.codex.respond).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('查看全部'))
    await s.send(`/approval ${token}`)
    await vi.waitFor(() => expect(buttonCommands(s.qq.reply.mock.calls.at(-1)![2])).toContain(`/approve ${token}`))
    await s.send(`/approve ${token}`)
    expect(s.codex.respond).toHaveBeenCalledExactlyOnceWith('request', { decision: 'accept' })
  })

  it('requires all review pages and only accepts a request once', async () => {
    const s = setup()
    await s.start()
    s.codex.emit('request', {
      id: 'request',
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thread',
        turnId: 'turn',
        itemId: 'item',
        command: 'echo '.repeat(400),
        reason: 'review',
      },
    })
    await vi.waitFor(() =>
      expect(
        s.qq.reply.mock.calls.some(call =>
          replyText(call[2]).includes('待审批'),
        ),
      ).toBe(true),
    )
    const text = replyText(s.qq.reply.mock.calls.at(-1)![2])
    const token = text.match(/待审批 (\w+)/)![1]
    const count = Number(text.match(/\(1\/(\d+)\)/)![1])
    await s.send(`/approve ${token}`, 'stranger')
    await s.send(`/approve ${token}`)
    expect(s.codex.respond).not.toHaveBeenCalled()
    expect(buttonCommands(s.qq.reply.mock.calls.at(-1)![2])).not.toContain(`/approve ${token}`)
    for (let page = 1; page <= count; page++) {
      const before = s.qq.reply.mock.calls.length
      await s.send(`/approval ${token} ${page}`)
      await vi.waitFor(() => expect(s.qq.reply.mock.calls.length).toBeGreaterThan(before))
    }
    expect(buttonCommands(s.qq.reply.mock.calls.at(-1)![2])).toContain(`/approve ${token}`)
    await s.send(`/approve ${token}`)
    await s.send(`/approve ${token}`)
    expect(s.codex.respond).toHaveBeenCalledExactlyOnceWith('request', {
      decision: 'accept',
    })
  })

  it('denies mismatched requests, permission escalation and unsupported tools', async () => {
    const s = setup()
    await s.start()
    s.codex.emit('request', {
      id: 1,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: 'another', turnId: 'turn' },
    })
    s.codex.emit('request', {
      id: 2,
      method: 'item/permissions/requestApproval',
      params: { threadId: 'thread', turnId: 'turn' },
    })
    s.codex.emit('request', {
      id: 3,
      method: 'unknown/tool',
      params: { threadId: 'thread', turnId: 'turn' },
    })
    expect(s.codex.respond).toHaveBeenCalledWith(1, { decision: 'decline' })
    expect(s.codex.respond).toHaveBeenCalledWith(2, {
      permissions: {},
      scope: 'turn',
    })
    expect(s.codex.reject).toHaveBeenCalledWith(3)
  })

  it('returns structured answers and clears pending requests on stop', async () => {
    const s = setup()
    await s.start()
    s.codex.emit('request', {
      id: 1,
      method: 'item/tool/requestUserInput',
      params: {
        threadId: 'thread',
        turnId: 'turn',
        questions: [{ id: 'name', question: 'Name?' }],
      },
    })
    await vi.waitFor(() =>
      expect(
        s.qq.reply.mock.calls.some(call =>
          replyText(call[2]).includes('待回答'),
        ),
      ).toBe(true),
    )
    const token = replyText(s.qq.reply.mock.calls.at(-1)![2]).match(
      /待回答 (\w+)/,
    )![1]
    await s.send(`/answer ${token} {"name":"Alice"}`)
    expect(s.codex.respond).toHaveBeenCalledWith(1, {
      answers: { name: { answers: ['Alice'] } },
    })
    s.codex.emit('notification', {
      method: 'item/started',
      params: {
        threadId: 'thread',
        turnId: 'turn',
        item: { id: 'file', type: 'fileChange', changes: [{ path: '/demo/file.ts', diff: '+safe change' }] },
      },
    })
    s.codex.emit('request', {
      id: 2,
      method: 'item/fileChange/requestApproval',
      params: { threadId: 'thread', turnId: 'turn', itemId: 'file' },
    })
    expect(s.codex.respond).not.toHaveBeenCalledWith(2, { decision: 'decline' })
    await s.send('/stop')
    expect(s.codex.respond).toHaveBeenCalledWith(2, { decision: 'decline' })
  })

  it('persists full paginated results after reply failure', async () => {
    const s = setup()
    s.qq.reply.mockRejectedValueOnce(new Error('QQ offline'))
    await s.start()
    const text = '结果🙂'.repeat(1000)
    s.codex.emit('notification', {
      method: 'item/completed',
      params: {
        threadId: 'thread',
        turnId: 'turn',
        item: { id: 'a', type: 'agentMessage', phase: 'final_answer', text },
      },
    })
    s.codex.emit('notification', {
      method: 'turn/completed',
      params: { threadId: 'thread', turn: { id: 'turn', status: 'completed' } },
    })
    await s.send(`/result ${s.state.tasks[0].id} 2`)
    expect(s.state.tasks[0].output).toBe(text)
    await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('(2/'))
    expect(cardPages(text).join('')).toBe(text)
  })
  it('limits passive replies and keeps approvals discoverable with a fresh status message', async () => {
    const s = setup()
    await s.start()
    for (let id = 0; id < 6; id++) {
      s.codex.emit('request', { id, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread', turnId: 'turn', itemId: String(id), command: 'echo test' } })
    }
    await vi.waitFor(() => expect(s.qq.reply.mock.calls.filter(call => call[1] === '1').map(call => call[3])).toEqual([1, 2, 3, 4]))
    await s.send('/status')
    await vi.waitFor(() => expect(replyText(s.qq.reply.mock.calls.at(-1)![2])).toContain('待审批'))
    s.codex.emit('notification', { method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'turn', status: 'completed' } } })
    await vi.waitFor(() => expect(s.state.tasks[0].status).toBe('completed'))
  })

  it('acknowledges admitted input without waiting for the QQ reply network', async () => {
    const s = setup()
    let release!: (value: unknown) => void
    s.qq.reply.mockImplementationOnce(() => new Promise((resolve) => {
      release = resolve
    }))
    await s.send('work')
    await vi.waitFor(() => expect(s.codex.turn).toHaveBeenCalledOnce())
    await s.send('/stop')
    expect(s.codex.interrupt).toHaveBeenCalledOnce()
    release({})
  })
})
