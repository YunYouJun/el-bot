import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { DshMobileHost } from './host'

it('projects only visible messages and preserves session, model and workspace identity', async () => {
  const summary = { sessionId: 'existing', updatedAt: Date.now(), running: false, projections: { values: { title: 'Existing title', modelSelection: { next: { provider: 'tokenlink', model: 'hy4' } } } } }
  let aborted = false
  const events = [
    { type: 'user/message', data: { source: { kind: 'user', rpcId: 'stable-request' }, content: [{ type: 'text', text: 'Remember this' }, { type: 'image', data: 'private-bytes' }] } },
    { type: 'tool/result', data: { text: 'private tool output' } },
    { type: 'assistant/message', data: { stream: [{ type: 'text-delta', text: 'Answer' }] } },
    { type: 'user/message', data: { source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'Internal policy and filesystem context' }] } },
    { type: 'user/message', data: { source: { kind: 'user-approval' }, content: [{ type: 'text', text: 'Private approval context' }] } },
  ].map((event, seq) => ({ type: 'event' as const, event: { ...event, seq, time: Date.now() } }))
  const page = vi.fn(async () => ({ records: events.slice(0, 1), hasMore: false }))
  const prompt = vi.fn(async () => ({ accepted: true }))
  const modelCatalog = vi.fn(async () => ({
    default: { provider: 'tokenlink', model: 'hy4' },
    groups: [
      {
        id: 'tokenlink',
        name: 'TokenLink',
        models: [
          { id: 'hy4', name: 'Hunyuan 4' },
          { id: 'hy4-thinking', name: 'Hunyuan 4 Thinking', description: 'Longer reasoning' },
        ],
      },
      { id: 'failed-provider', name: 'Unavailable', models: [] },
    ],
  }))
  const selectModel = vi.fn(async () => ({ selected: { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'low' } }))
  const controller = {
    list: async () => ({ items: [summary, { ...summary, sessionId: 'hidden-child', origin: 'subagent' }] }),
    create: async () => ({ sessionId: 'new' }),
    modelCatalog,
    selectModel,
    prompt,
    page,
    async* follow(_request: unknown, signal: AbortSignal) {
      try {
        yield { type: 'snapshot', cursor: 42, records: events, hasMore: true }
      }
      finally {
        aborted = signal.aborted
      }
    },
  }
  const host = new DshMobileHost(controller, { list: () => [{ id: 'w', title: '小云 Bot · 群聊', sessionIds: ['existing'] }], create: async () => ({ id: 'w' }) }, { publicBaseUrl: 'https://bot.test' }, () => 'Answer')
  const signal = new AbortController().signal
  expect(await host.list(signal)).toEqual([{ id: 'existing', title: 'Existing title', updatedAt: new Date(summary.updatedAt).toISOString(), running: false, workspace: '小云 Bot · 群聊', provider: 'tokenlink', model: 'hy4' }])
  const history = await host.conversation('existing', signal)
  expect(history.messages.map(m => [m.id, m.role, m.text])).toEqual([['existing:0', 'user', 'Remember this'], ['existing:2', 'assistant', 'Answer']])
  expect(history.messages[0].requestId).toBe('stable-request')
  expect(aborted).toBe(true)
  expect(history.hasMore).toBe(true)
  expect(await host.models('existing', signal)).toEqual({
    current: { provider: 'tokenlink', model: 'hy4' },
    groups: [{
      id: 'tokenlink',
      name: 'TokenLink',
      models: [
        { id: 'hy4', name: 'Hunyuan 4' },
        { id: 'hy4-thinking', name: 'Hunyuan 4 Thinking', description: 'Longer reasoning' },
      ],
    }],
  })
  await expect(host.models('missing', signal)).rejects.toThrow('session_not_found')
  expect(await host.selectModel('existing', { provider: 'openai', model: 'gpt-6-luna' }, signal)).toEqual({
    provider: 'openai',
    model: 'gpt-6-luna',
    reasoningEffort: 'low',
  })
  expect(selectModel).toHaveBeenCalledWith({ sessionId: 'existing', provider: 'openai', model: 'gpt-6-luna' })
  await expect(host.selectModel('missing', { provider: 'openai', model: 'gpt-6-luna' }, signal)).rejects.toThrow('session_not_found')
  await host.conversation('existing', signal, 8)
  expect(page).toHaveBeenCalledWith({ address: { kind: 'session', sessionId: 'existing' }, throughSeq: 42, beforeSeq: 8, maxMessages: 80 }, signal)
  await host.prompt('existing', 'Continue', 'retry-stable-id', signal)
  expect(prompt).toHaveBeenCalledWith({ sessionId: 'existing', requestId: 'retry-stable-id', mode: 'queue', content: [{ type: 'text', text: 'Continue' }] }, signal)
  await expect(host.prompt('missing', 'No', 'request', signal)).rejects.toThrow('session_not_found')
})

it('allocates a new native session without interpreting a request ID as a resume ID', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-bot-mobile-create-'))
  const create = vi.fn(async () => ({ sessionId: 'native-generated-session' }))
  const controller = {
    list: () => {},
    create,
    modelCatalog: () => {},
    selectModel: () => {},
    prompt: () => {},
    follow: () => {},
    page: () => {},
  }
  const workspaces = { list: () => [], create: async () => ({ id: 'mobile-workspace' }) }
  const host = new DshMobileHost(controller, workspaces, { publicBaseUrl: 'https://bot.test', workspaceDirectory: directory }, () => '')
  try {
    expect(await Promise.all([host.create('retry-id'), host.create('retry-id')])).toEqual(['native-generated-session', 'native-generated-session'])
    expect(create).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'mobile-workspace' })
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('classifies QQ sources by workspace identity rather than editable names', async () => {
  const workspaces = [
    { id: 'private', path: '/home/bot/.dsh-qqbot/workspaces/123/private', title: 'Renamed private', sessionIds: ['direct'] },
    { id: 'groups', path: '/home/bot/.dsh-qqbot/workspaces/123/groups', title: 'Renamed group', sessionIds: ['group'] },
    { id: 'native', path: '/home/bot/.dsh-qqbot/workspace/mobile', title: 'QQ · 群聊', sessionIds: ['native'] },
    { id: 'other', path: '/projects/qq/groups', title: 'QQ · 私聊', sessionIds: ['other'] },
  ]
  const items = ['direct', 'group', 'native', 'other', 'ungrouped'].map(sessionId => ({ sessionId, updatedAt: Date.now(), running: false }))
  const controller = {
    list: async () => ({ items }),
    create() {},
    modelCatalog() {},
    selectModel() {},
    prompt() {},
    follow() {},
    page() {},
  }
  const host = new DshMobileHost(controller, { list: () => workspaces, create() {} }, { publicBaseUrl: 'https://bot.test' }, () => '')
  const rows = await host.list(new AbortController().signal)
  expect(rows.map(row => row.source)).toEqual([
    { platform: 'qq', kind: 'direct' },
    { platform: 'qq', kind: 'group' },
    undefined,
    undefined,
    undefined,
  ])
  expect(rows[0].workspace).toBe('Renamed private')
})

it('uses the live QQ adapter to recognize customized workspace directories', async () => {
  const privatePath = '/custom/bot/direct'
  const groupPath = '/custom/bot/rooms'
  const controller = {
    list: async () => ({ items: ['direct', 'group', 'unrelated'].map(sessionId => ({ sessionId, updatedAt: Date.now(), running: false })) }),
    create() {},
    modelCatalog() {},
    selectModel() {},
    prompt() {},
    follow() {},
    page() {},
  }
  const workspaces = {
    list: () => [
      { id: 'one', path: privatePath, title: 'Private', sessionIds: ['direct'] },
      { id: 'two', path: groupPath, title: 'Rooms', sessionIds: ['group'] },
      { id: 'three', path: '/old/.dsh-qqbot/workspaces/999/groups', title: 'Old bot', sessionIds: ['unrelated'] },
    ],
    create() {},
  }
  const host = new DshMobileHost(controller, workspaces, { publicBaseUrl: 'https://bot.test' }, () => '', () => ({ workspaces: { c2c: { path: privatePath }, group: { path: groupPath } } }))
  expect((await host.list(new AbortController().signal)).map(row => row.source)).toEqual([
    { platform: 'qq', kind: 'direct' },
    { platform: 'qq', kind: 'group' },
    undefined,
  ])
})

it('enriches only matching QQ sessions and resolves details without opening or prompting an agent', async () => {
  const controller = {
    list: async () => ({ items: ['group', 'native'].map(sessionId => ({ sessionId, updatedAt: 0, running: false })) }),
    create: vi.fn(),
    modelCatalog: vi.fn(),
    selectModel: vi.fn(),
    prompt: vi.fn(),
    follow: vi.fn(),
    page: vi.fn(),
  }
  const source = {
    platform: 'qq' as const,
    kind: 'group' as const,
    peerId: 'allowed',
    appId: '123',
    name: 'Book club',
    lastMessage: { id: 'message', senderId: 'member', senderName: 'Alice', text: 'Hello', type: 'text', createdAt: '2026-11-07T00:00:00.000Z' },
  }
  const metadata = {
    summaries: vi.fn(async () => ({ group: source, native: source })),
    details: vi.fn(async () => ({ ...source, memberCount: 6 })),
  }
  const host = new DshMobileHost(controller, {
    list: () => [{ id: 'qq', title: 'QQ', path: '/custom/groups', sessionIds: ['group'] }],
    create: vi.fn(),
  }, { publicBaseUrl: 'https://bot.test' }, () => '', () => ({ workspaces: { c2c: { path: '/custom/private' }, group: { path: '/custom/groups' } } }), () => metadata)
  const signal = new AbortController().signal
  const list = await host.list(signal)
  expect(list[0]?.source).toEqual(source)
  expect(list[0]?.updatedAt).toBe(source.lastMessage.createdAt)
  expect(list[1]?.source).toBeUndefined()
  expect((await host.information('group', signal)).source).toMatchObject({ name: 'Book club', memberCount: 6 })
  await host.information('native', signal)
  expect(metadata.details).toHaveBeenCalledExactlyOnceWith('group')
  await expect(host.information('missing', signal)).rejects.toThrow('session_not_found')
  expect(controller.prompt).not.toHaveBeenCalled()
  expect(controller.follow).not.toHaveBeenCalled()
})
