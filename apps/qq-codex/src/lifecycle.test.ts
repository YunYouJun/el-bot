import { describe, expect, it, vi } from 'vitest'
import { cleanupAll, RuntimeLifecycle, StartupCancelled } from './lifecycle'

describe('runtime lifecycle', () => {
  it('waits for startup to unwind and shares the same cleanup promise', async () => {
    const cleanup = vi.fn(async () => {})
    const lifecycle = new RuntimeLifecycle(cleanup)
    const first = lifecycle.stop()
    expect(lifecycle.stop()).toBe(first)
    expect(() => lifecycle.checkpoint()).toThrow(StartupCancelled)
    await Promise.resolve()
    expect(cleanup).not.toHaveBeenCalled()
    lifecycle.started()
    await first
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('releases later resources even if an earlier cleanup fails', async () => {
    const release = vi.fn(async () => {})
    await expect(cleanupAll([async () => {
      throw new Error('write failed')
    }, release])).rejects.toThrow(AggregateError)
    expect(release).toHaveBeenCalledOnce()
  })
})
