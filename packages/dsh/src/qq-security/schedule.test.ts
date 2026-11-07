import type { ManualTarget } from './manual-types'
import type { ScheduleBridge, ScheduleLlm, ScheduleMessage, ScheduleStateView } from './schedule-types'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { digest } from './policy'
import { renderDigest, ScheduleControl } from './schedule'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

const target: ManualTarget = {
  id: digest('group-a'),
  scope: 'group',
  peerId: 'group-a',
  sessionId: 'group-session',
  title: '测试群',
}

const rows: ScheduleMessage[] = [
  { text: '今天先确认接口字段', senderName: 'Alice', senderId: 'alice', createdAt: '2026-11-07T13:00:00.000Z' },
  { text: '我下午补测试', senderName: 'Bob', senderId: 'bob', createdAt: '2026-11-07T13:05:00.000Z' },
]

async function fixture(model = true) {
  const directory = await mkdtemp(join(tmpdir(), 'qq-schedule-'))
  directories.push(directory)
  let time = Date.UTC(2026, 10, 7, 13, 59)
  const bridge: ScheduleBridge = {
    online: vi.fn(() => true),
    targets: vi.fn(async () => [target]),
    model: vi.fn(() => model ? { provider: 'test-provider', model: 'test-model' } : undefined),
    recent: vi.fn(async () => rows),
    send: vi.fn(async () => ({ id: 'qq-message-1' })),
  }
  const llm: ScheduleLlm = {
    stream: vi.fn(() => (async function* () {
      yield { type: 'text-delta', text: '接口字段已确认，' }
      yield { type: 'text-delta', text: '下午补测试。' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()),
  }
  const control = new ScheduleControl(join(directory, 'scheduled.json'), bridge, {
    timezone: 'Asia/Shanghai',
    now: () => time,
    intervalMs: 3_600_000,
    llm,
  })
  await control.initialize()
  const advance = (ms: number) => {
    time += ms
  }
  const create = async (input: Record<string, unknown> = {}) => {
    const view = await control.request({
      operation: 'create',
      target: target.id,
      kind: 'text',
      time: '22:00',
      days: [6],
      text: '本周进度已更新',
      ...input,
    }) as ScheduleStateView
    return view.tasks.at(-1)!
  }
  return { directory, bridge, llm, control, create, advance }
}

describe('owner scheduled group messages', () => {
  it('persists owner tasks with private permissions and resolves the next local occurrence', async () => {
    const f = await fixture()
    const task = await f.create()
    expect(task).toMatchObject({ target: target.id, title: target.title, kind: 'text', time: '22:00', days: [6], enabled: true })
    expect(task.nextRunAt).toBe(Date.UTC(2026, 10, 7, 14, 0))
    const view = await f.control.view()
    expect(view.targets).toEqual([{ id: target.id, title: target.title, sessionId: target.sessionId, model: { provider: 'test-provider', model: 'test-model' } }])
    expect(view.summaryModel).toEqual({ provider: 'test-provider', model: 'test-model' })
    const stored = await readFile(f.control.path, 'utf8')
    expect(stored).toContain('本周进度已更新')
    if (process.platform !== 'win32')
      expect((await stat(f.control.path)).mode & 0o777).toBe(0o600)
  })

  it('runs a due task once per local minute and never retries after a restart', async () => {
    const f = await fixture()
    await f.create()
    f.advance(60_000)
    await f.control.tick()
    await vi.waitFor(() => expect(f.bridge.send).toHaveBeenCalledExactlyOnceWith(target, '本周进度已更新'))
    await f.control.tick()
    expect(f.bridge.send).toHaveBeenCalledOnce()
    f.control.close()
    const restarted = new ScheduleControl(f.control.path, f.bridge, { timezone: 'Asia/Shanghai', now: () => Date.UTC(2026, 10, 7, 14, 0), intervalMs: 3_600_000 })
    await restarted.initialize()
    await restarted.tick()
    expect(f.bridge.send).toHaveBeenCalledOnce()
    restarted.close()
  })

  it('records an offline skip for the minute and does not send later in the same minute', async () => {
    const f = await fixture()
    await f.create()
    f.advance(60_000)
    vi.mocked(f.bridge.online).mockReturnValue(false)
    await f.control.tick()
    const offline = (await f.control.view()).tasks[0]!
    expect(offline.lastStatus).toBe('offline')
    expect(f.bridge.send).not.toHaveBeenCalled()
    vi.mocked(f.bridge.online).mockReturnValue(true)
    await f.control.tick()
    expect(f.bridge.send).not.toHaveBeenCalled()
  })

  it('does not send twice when the owner runs a task inside its due window', async () => {
    const f = await fixture()
    await f.create()
    f.advance(125_000)
    const task = (await f.control.view()).tasks[0]!
    await f.control.request({ operation: 'run', id: task.id })
    await f.control.tick()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(f.bridge.send).toHaveBeenCalledOnce()
  })

  it('generates a model summary only when the group has a model and messages', async () => {
    const f = await fixture()
    await f.create({ kind: 'summary', text: undefined, windowHours: 24, maxMessages: 200 })
    await f.control.request({ operation: 'run', id: (await f.control.view()).tasks[0]!.id })
    expect(f.bridge.recent).toHaveBeenCalledWith(target, expect.any(Number), expect.any(Number), 200)
    expect(f.bridge.send).toHaveBeenCalledWith(target, '接口字段已确认，下午补测试。')
    const prompt = vi.mocked(f.llm.stream).mock.calls[0]![0].messages[0]!.content[0]!.text
    expect(prompt).toContain('Alice：今天先确认接口字段')
    expect(prompt).toContain('测试群')
  })

  it('does not send a summary without a model or messages', async () => {
    const noModel = await fixture(false)
    await noModel.create({ kind: 'summary', text: undefined })
    await expect(noModel.control.request({ operation: 'run', id: (await noModel.control.view()).tasks[0]!.id })).rejects.toMatchObject({ code: 'model_unavailable' })
    expect(noModel.bridge.send).not.toHaveBeenCalled()

    const empty = await fixture()
    vi.mocked(empty.bridge.recent).mockResolvedValue([])
    await empty.create({ kind: 'summary', text: undefined })
    await expect(empty.control.request({ operation: 'run', id: (await empty.control.view()).tasks[0]!.id })).rejects.toMatchObject({ code: 'summary_empty' })
    expect(empty.bridge.send).not.toHaveBeenCalled()
  })

  it('renders a bounded rule-based digest without calling a model', async () => {
    const f = await fixture()
    await f.create({ kind: 'digest', text: undefined })
    await f.control.request({ operation: 'run', id: (await f.control.view()).tasks[0]!.id })
    const text = vi.mocked(f.bridge.send).mock.calls[0]![1]
    expect(text).toContain('【群聊摘要】')
    expect(text).toContain('共 2 条文本消息，2 位成员发言')
    expect(text).toContain('Alice（1）')
    expect(f.llm.stream).not.toHaveBeenCalled()
  })

  it('previews generated content without sending or recording a run', async () => {
    const f = await fixture()
    const task = await f.create({ kind: 'summary', text: undefined })
    const preview = await f.control.request({ operation: 'preview', id: task.id }) as { text: string, kind: string }
    expect(preview).toMatchObject({ kind: 'summary', text: '接口字段已确认，下午补测试。' })
    expect(f.bridge.send).not.toHaveBeenCalled()
    expect((await f.control.view()).runs).toEqual([])
  })

  it('rate-limits repeated previews but allows another preview after ten seconds', async () => {
    const f = await fixture()
    const task = await f.create()
    await f.control.request({ operation: 'preview', id: task.id })
    await expect(f.control.request({ operation: 'preview', id: task.id })).rejects.toMatchObject({ code: 'rate_limited' })
    f.advance(10_000)
    await expect(f.control.request({ operation: 'preview', id: task.id })).resolves.toMatchObject({ id: task.id })
  })

  it('keeps platform failures visible and never falls back to another target', async () => {
    const f = await fixture()
    const task = await f.create()
    vi.mocked(f.bridge.send).mockRejectedValueOnce(Object.assign(new Error('denied'), { bizCode: 40034105 }))
    await expect(f.control.request({ operation: 'run', id: task.id })).rejects.toMatchObject({ code: 'send_failed' })
    const view = await f.control.view()
    expect(view.runs[0]).toMatchObject({ taskId: task.id, status: 'failed', code: '40034105' })
    expect(view.tasks[0]!.lastCode).toBe('40034105')
    expect(f.bridge.send).toHaveBeenCalledOnce()
  })

  it('rejects non-group targets, invalid schedules and over-limit task counts', async () => {
    const f = await fixture()
    vi.mocked(f.bridge.targets).mockResolvedValueOnce([{ ...target, scope: 'c2c' }])
    await expect(f.control.request({ operation: 'create', target: target.id, time: '22:00', days: [6], text: 'x' })).rejects.toMatchObject({ code: 'invalid_target' })
    await expect(f.control.request({ operation: 'create', target: target.id, time: '25:00', days: [6], text: 'x' })).rejects.toMatchObject({ code: 'invalid_time' })
    await expect(f.control.request({ operation: 'create', target: target.id, time: '22:00', days: [0], text: 'x' })).rejects.toMatchObject({ code: 'invalid_time' })
    await expect(f.control.request({ operation: 'create', target: target.id, time: '22:00', days: [6], text: '' })).rejects.toMatchObject({ code: 'invalid_text' })
  })

  it('enforces the per-group limit when moving an existing task', async () => {
    const f = await fixture()
    const other: ManualTarget = { ...target, id: digest('group-b'), peerId: 'group-b', sessionId: 'group-b-session', title: '测试群 B' }
    vi.mocked(f.bridge.targets).mockResolvedValue([target, other])
    for (let index = 0; index < 4; index++) {
      await f.create({ target: target.id, time: `2${index}:00` })
      await f.create({ target: other.id, time: `2${index}:00` })
    }
    const moving = (await f.control.view()).tasks.find(task => task.target === other.id)!
    await expect(f.control.request({ operation: 'update', id: moving.id, target: target.id })).rejects.toMatchObject({ code: 'group_limit' })
    expect((await f.control.view()).tasks.filter(task => task.target === target.id)).toHaveLength(4)
  })
})

it('keeps rule-based digests under the proactive message limit', () => {
  const many = Array.from({ length: 200 }, (_, index) => ({
    text: `消息 ${index} ${'很长的内容'.repeat(20)}`,
    senderName: `成员${index % 8}`,
    senderId: `member-${index % 8}`,
    createdAt: '2026-11-07T13:00:00.000Z',
  }))
  const text = renderDigest('测试群', Date.UTC(2026, 10, 7, 0), Date.UTC(2026, 10, 8, 0), many, 'Asia/Shanghai')
  expect(text.length).toBeLessThanOrEqual(1200)
  expect(text).toContain('共 200 条文本消息')
})

it('starts with an empty journal without crashing the bot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-schedule-broken-'))
  directories.push(directory)
  const control = new ScheduleControl(join(directory, 'scheduled.json'), {
    online: () => true,
    targets: async () => [target],
    model: () => undefined,
    recent: async () => [],
    send: async () => ({}),
  }, { timezone: 'Asia/Shanghai', intervalMs: 3_600_000 })
  await control.initialize()
  await control.tick()
  await expect(control.view()).resolves.toMatchObject({ tasks: [] })
  control.close()
})
