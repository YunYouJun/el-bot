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
