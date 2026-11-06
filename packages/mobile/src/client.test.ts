import { afterEach, expect, it, vi } from 'vitest'
import { apply } from './client'

afterEach(() => vi.unstubAllGlobals())

it('waits for the real session baseline before navigating, then opens only once', () => {
  const microtasks: (() => void)[] = []
  const listeners: (() => void)[] = []
  const snapshot: { phase: string, byId: Record<string, { retainedBy?: { mainView?: number } }> } = { phase: 'loading', byId: {} }
  const flush = () => {
    while (microtasks.length) microtasks.shift()!()
  }
  const dataset: Record<string, string> = {}
  const states: Record<string, string> = { 'previous': 'loading', 'phone-session': 'loading' }
  const stateListeners = new Set<() => void>()
  const removeEventListener = vi.fn()
  vi.stubGlobal('window', { location: { hash: '#yun-phone=phone-session' }, addEventListener: vi.fn(), removeEventListener })
  vi.stubGlobal('document', { documentElement: { dataset } })
  vi.stubGlobal('queueMicrotask', (callback: () => void) => microtasks.push(callback))
  vi.stubGlobal('setTimeout', (callback: () => void) => microtasks.push(callback))
  vi.stubGlobal('clearTimeout', vi.fn())
  const openSession = vi.fn((id: string) => {
    if (!snapshot.byId[id])
      throw new Error('sessions.retain: unknown session')
    // Retaining mainView synchronously republishes before UI restoration returns.
    for (const row of Object.values(snapshot.byId)) row.retainedBy = {}
    snapshot.byId[id]!.retainedBy = { mainView: 1 }
    listeners.forEach(listener => listener())
  })
  let dispose!: () => void
  apply({
    uiWorkspace: { openSession },
    sessions: { binding: (id: string) => ({ session: {
      getSnapshot: () => ({ openState: states[id] ?? 'loading' }),
      subscribe: (listener: () => void) => {
        stateListeners.add(listener)
        return () => {
          stateListeners.delete(listener)
        }
      },
    } }), list: { getSnapshot: () => snapshot, subscribe: (listener: () => void) => {
      listeners.push(listener)
      return vi.fn()
    } } },
    effect: (install: () => (() => void)) => { dispose = install() },
  })
  expect(flush).not.toThrow()
  expect(openSession).not.toHaveBeenCalled()
  snapshot.byId['phone-session'] = {}
  snapshot.phase = 'ready'
  listeners.forEach(callback => callback())
  flush()
  expect(openSession).not.toHaveBeenCalled()
  // The UI finishes restoring its old main session after the list baseline.
  snapshot.byId.previous = { retainedBy: { mainView: 1 } }
  listeners.forEach(callback => callback())
  flush()
  expect(openSession).not.toHaveBeenCalled()
  states.previous = 'open'
  stateListeners.forEach(callback => callback())
  flush()
  expect(dataset.yunPhoneSession).toBeUndefined()
  states['phone-session'] = 'open'
  stateListeners.forEach(callback => callback())
  flush()
  expect(openSession).toHaveBeenCalledExactlyOnceWith('phone-session')
  expect(dataset.yunPhoneSession).toBe('phone-session')
  // Manual navigation later must clear the proof rather than force the user back.
  snapshot.byId['phone-session']!.retainedBy = {}
  snapshot.byId.previous!.retainedBy = { mainView: 1 }
  listeners.forEach(callback => callback())
  flush()
  expect(dataset.yunPhoneSession).toBeUndefined()
  expect(openSession).toHaveBeenCalledTimes(1)
  dispose()
  expect(removeEventListener).toHaveBeenCalled()
})
