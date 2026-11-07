import type { ModelRoute, SessionContext, SessionContextPolicy } from './types'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function nonnegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** Project DSH's next-request estimate, never cumulative billing usage. */
export function contextUsage(values: Record<string, unknown>): SessionContext | undefined {
  const pressure = record(values.contextPressure)
  const projected = nonnegative(pressure.projectedTokens)
  const sampled = nonnegative(pressure.pressureTokens)
  const capacity = nonnegative(pressure.contextWindow)
  const usedTokens = projected ?? sampled
  if (usedTokens === undefined && !capacity)
    return
  return {
    ...(usedTokens === undefined ? {} : { usedTokens }),
    ...capacity ? { contextWindow: capacity } : {},
    ...(usedTokens === undefined ? {} : { usageSource: projected === undefined ? 'last-request' as const : 'projected' as const }),
  }
}

interface NativeAgent { ctx: object }
interface ContextRuntime {
  agents: { get: (id: string) => NativeAgent | undefined }
  persistence: { stat: (id: string) => Promise<{ header: { agentPreset?: string } } | undefined> }
  presets: {
    serviceFor: (agent: NativeAgent, name: string) => { config?: unknown } | undefined
    composedPreset: (ctx: object) => string | undefined
    acquireScope: (id: string) => Promise<{ key: object, [Symbol.asyncDispose]: () => Promise<void> }>
  }
  scope: (parent: object) => { ctx: object, dispose: () => Promise<void> }
}

export type ContextPolicyReader = (id: string, route: ModelRoute | undefined, signal: AbortSignal) => Promise<SessionContextPolicy | undefined>

function policy(value: unknown, route: ModelRoute | undefined, source: 'active' | 'preset', preset?: string): SessionContextPolicy | undefined {
  const config = record(value)
  if (typeof config.auto !== 'boolean')
    return
  const override = Array.isArray(config.modelPolicies)
    ? record(config.modelPolicies.find(item => record(item).provider === route?.provider && record(item).model === route?.model))
    : {}
  const thresholdRatio = nonnegative(override.thresholdRatio ?? config.thresholdRatio)
  const headroomTokens = nonnegative(override.headroomTokens ?? config.headroomTokens)
  const retainTokens = nonnegative(override.retainTokens ?? (override.retainRatio === undefined ? config.retainTokens : undefined))
  const retainRatio = retainTokens === undefined ? nonnegative(override.retainRatio ?? config.retainRatio) : undefined
  if (thresholdRatio === undefined || thresholdRatio > 1 || headroomTokens === undefined)
    return
  return {
    automatic: config.auto,
    thresholdRatio,
    headroomTokens,
    ...(retainTokens === undefined ? {} : { retainTokens }),
    ...(retainRatio === undefined || retainRatio > 1 ? {} : { retainRatio }),
    source,
    ...preset ? { preset } : {},
  }
}

/** Read the actual native service, retaining cold preset scope without starting an Agent. */
export function createContextPolicyReader(runtime: ContextRuntime): ContextPolicyReader {
  return async (id, route, signal) => {
    signal.throwIfAborted()
    const agent = runtime.agents.get(id)
    if (agent) {
      return policy(runtime.presets.serviceFor(agent, 'compaction')?.config, route, 'active', runtime.presets.composedPreset(agent.ctx))
    }
    const stored = await runtime.persistence.stat(id)
    signal.throwIfAborted()
    const preset = stored?.header.agentPreset
    if (!preset)
      return
    const lease = await runtime.presets.acquireScope(preset)
    try {
      signal.throwIfAborted()
      const scope = runtime.scope(lease.key)
      try {
        return policy(runtime.presets.serviceFor({ ctx: scope.ctx }, 'compaction')?.config, route, 'preset', preset)
      }
      finally {
        await scope.dispose()
      }
    }
    finally {
      await lease[Symbol.asyncDispose]()
    }
  }
}
