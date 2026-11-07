import { expect, it, vi } from 'vitest'
import { contextUsage, createContextPolicyReader } from './context'

it('uses next-request pressure including cached input, not cumulative billing usage', () => {
  expect(contextUsage({ contextPressure: { projectedTokens: 14500, pressureTokens: 12000, contextWindow: 1048576 }, tokenUsage: { outputTokens: 900000 } }))
    .toEqual({ usedTokens: 14500, contextWindow: 1048576, usageSource: 'projected' })
  expect(contextUsage({ contextPressure: { pressureTokens: 0, contextWindow: 100 } }))
    .toEqual({ usedTokens: 0, contextWindow: 100, usageSource: 'last-request' })
  expect(contextUsage({ contextPressure: { projectedTokens: -1, contextWindow: 0 } })).toBeUndefined()
  expect(contextUsage({})).toBeUndefined()
})

function fixture() {
  const nativeConfig = { auto: true, thresholdRatio: 0.8, headroomTokens: 65536, retainRatio: 0.16, summarizationModel: 'private-model', apiKey: 'private-secret', modelPolicies: [{ provider: 'small', model: 'chat', thresholdRatio: 0.6, headroomTokens: 4096, retainTokens: 2048 }] }
  const ctx = {}
  const agent = { ctx }
  const scopeDispose = vi.fn(async () => {})
  const release = vi.fn(async () => {})
  const runtime = {
    agents: { get: vi.fn((): typeof agent | undefined => agent) },
    persistence: { stat: vi.fn(async () => ({ header: { agentPreset: 'standard' } })) },
    presets: {
      serviceFor: vi.fn(() => ({ config: nativeConfig })),
      composedPreset: vi.fn(() => 'standard'),
      acquireScope: vi.fn(async () => ({ key: {}, [Symbol.asyncDispose]: release })),
    },
    scope: vi.fn(() => ({ ctx: {}, dispose: scopeDispose })),
  }
  return { runtime, release, scopeDispose, read: createContextPolicyReader(runtime) }
}

it('reads live native policy with exact model overrides and exposes only safe fields', async () => {
  const f = fixture()
  const result = await f.read('live', { provider: 'small', model: 'chat' }, new AbortController().signal)
  expect(result).toEqual({ automatic: true, thresholdRatio: 0.6, headroomTokens: 4096, retainTokens: 2048, source: 'active', preset: 'standard' })
  expect(JSON.stringify(result)).not.toMatch(/private/)
  expect(f.runtime.persistence.stat).not.toHaveBeenCalled()
  expect(f.runtime.presets.acquireScope).not.toHaveBeenCalled()
})

it('reads cold preset policy without creating an agent and releases both scopes', async () => {
  const f = fixture()
  f.runtime.agents.get.mockReturnValue(undefined)
  expect(await f.read('cold', undefined, new AbortController().signal)).toEqual({ automatic: true, thresholdRatio: 0.8, headroomTokens: 65536, retainRatio: 0.16, source: 'preset', preset: 'standard' })
  expect(f.runtime.persistence.stat).toHaveBeenCalledWith('cold')
  expect(f.scopeDispose).toHaveBeenCalledOnce()
  expect(f.release).toHaveBeenCalledOnce()
})

it('releases a cold preset lease when cancellation arrives during acquisition', async () => {
  const f = fixture()
  const abort = new AbortController()
  f.runtime.agents.get.mockReturnValue(undefined)
  f.runtime.presets.acquireScope.mockImplementation(async () => {
    abort.abort()
    return { key: {}, [Symbol.asyncDispose]: f.release }
  })
  await expect(f.read('cold', undefined, abort.signal)).rejects.toThrow()
  expect(f.runtime.scope).not.toHaveBeenCalled()
  expect(f.release).toHaveBeenCalledOnce()
})
