import type { PeerRecord, Route } from './contracts'
import type { ModelProjections } from './model-selection'
import { describe, expect, it, vi } from 'vitest'
import { legacySelection, projectedModel } from './model-selection'

function fixture() {
  const previous = { provider: 'deepseek-api', model: 'deepseek-flash' }
  let state: { pending: Route | null, lastUsed: Route | null } = { pending: null, lastUsed: previous }
  const listeners = new Set<(session: PeerRecord['agent']['session'], key: string) => void>()
  const record: PeerRecord = {
    sessionKey: 'qqbot:123:c2c:owner',
    sessionId: 'session',
    scope: 'c2c',
    peerId: 'owner',
    agent: { status: 'idle', options: previous, session: {
      header: { id: 'session' },
      append: (_type, value) => change({ ...state, pending: value }),
    }, whenIdle: async () => {} },
  }
  function change(next: typeof state, session = record.agent.session) {
    state = next
    for (const listener of listeners)
      listener(session, 'modelSelection')
  }
  const projections: ModelProjections = {
    stateOf: () => state,
    onChanged: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return { record, previous, projections, change }
}

describe('native Web and QQ model selection', () => {
  it('uses a Web selection for the next real request and persists the peer route', () => {
    const f = fixture()
    const persist = vi.fn()
    const { selection, dispose } = legacySelection(f.projections, f.record, f.previous, persist)
    const openai = { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'low' }
    f.change({ lastUsed: f.previous, pending: openai })
    // installModelSelection reads current at prompt assembly, then snapshots assembled.
    selection.assembled = selection.current
    expect(selection.assembled).toEqual(openai)
    expect(persist).toHaveBeenLastCalledWith(openai)
    f.change({ lastUsed: openai, pending: null })
    expect(selection.current).toEqual(openai)
    dispose()
    persist.mockClear()
    f.change({ lastUsed: openai, pending: f.previous })
    expect(persist).not.toHaveBeenCalled()
  })

  it('restores the durable Web selection over stale QQ resume options', () => {
    const f = fixture()
    const openai = { provider: 'openai', model: 'gpt-6-luna' }
    f.change({ lastUsed: f.previous, pending: openai })
    const persist = vi.fn()
    const { selection } = legacySelection(f.projections, f.record, f.previous, persist)
    expect(projectedModel(f.projections, f.record)).toEqual(openai)
    expect(selection.current).toEqual(openai)
    expect(persist).toHaveBeenLastCalledWith(openai)
  })

  it('records QQ /model forks in the same durable projection used by Web', () => {
    const f = fixture()
    const persist = vi.fn()
    const { selection } = legacySelection(f.projections, f.record, f.previous, persist)
    const openai = { provider: 'openai', model: 'gpt-6-luna' }
    selection.current = openai
    expect(projectedModel(f.projections, f.record)).toEqual(openai)
    expect(persist).toHaveBeenLastCalledWith(openai)
    const old = f.record.agent
    f.record.agent = { ...old, session: { header: { id: 'forked' } } }
    persist.mockClear()
    f.change({ lastUsed: f.previous, pending: null }, old.session)
    expect(persist).not.toHaveBeenCalled()
  })
})
