import type { PeerRecord, Route } from './contracts'

export interface ModelProjections {
  stateOf: (session: PeerRecord['agent']['session'], key: string) => unknown
  onChanged: (listener: (session: PeerRecord['agent']['session'], key: string) => void) => (() => void)
}
export interface ModelSelection { current: Route | undefined, assembled: Route | undefined }

function route(value: unknown): Route | undefined {
  if (!value || typeof value !== 'object' || !('provider' in value) || !('model' in value)
    || typeof value.provider !== 'string' || typeof value.model !== 'string') {
    return
  }
  return {
    provider: value.provider,
    model: value.model,
    ...('reasoningEffort' in value && typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}),
  }
}

/** Read the same durable selection as the native Web model picker. */
export function projectedModel(projections: ModelProjections, record: PeerRecord): Route | undefined {
  const state = projections.stateOf(record.agent.session, 'modelSelection')
  if (!state || typeof state !== 'object')
    return
  return ('pending' in state ? route(state.pending) : undefined)
    ?? ('lastUsed' in state ? route(state.lastUsed) : undefined)
}

/** Keep QQ routing, its restart preferences, and the Web picker on one selection. */
export function legacySelection(
  projections: ModelProjections,
  record: PeerRecord,
  initial: Route,
  persist: (route: Route) => void,
): { selection: ModelSelection, dispose: () => void } {
  const agent = record.agent
  const session = agent.session
  if (!session.append)
    throw new Error('The Web host does not expose durable model selection')
  let fallback = initial
  const current = () => projectedModel(projections, { ...record, agent }) ?? fallback
  const selection: ModelSelection = {
    get current() { return current() },
    set current(value) {
      if (!value)
        throw new Error('A QQ model selection requires a provider and model')
      fallback = value
      session.append!('model/selection', value)
    },
    assembled: undefined,
  }
  const dispose = projections.onChanged((changed, key) => {
    // Forks replace record.agent. Old handles can still emit while disposing.
    if (changed === session && record.agent === agent && key === 'modelSelection')
      persist(current())
  })
  persist(current())
  return { selection, dispose }
}
