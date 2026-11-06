import type {
  BotStatus,
  ChatMessage,
  Conversation,
  MobileHost,
  MobileSettings,
  ModelProviderGroup,
  ModelRoute,
  SessionModelCatalog,
  SessionSummary,
} from './types'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { MobileError } from './http'

interface HostSummary {
  sessionId: string
  updatedAt: number
  running: boolean
  origin?: string
  projections?: { values: Record<string, unknown> }
}
interface WireEvent { type: string, seq: number, time: number, data: unknown }
interface RecordEntry { type: 'event', event: WireEvent }
interface Snapshot {
  type: 'snapshot'
  cursor: number
  records: RecordEntry[]
  hasMore: boolean
}
interface Controller {
  list: (request: object, signal: AbortSignal) => Promise<{ items: HostSummary[] }>
  create: (request: { workspaceId: string }) => Promise<{ sessionId: string }>
  modelCatalog: () => Promise<unknown>
  selectModel: (request: ModelRoute & { sessionId: string }) => Promise<{ selected: unknown }>
  prompt: (request: { sessionId: string, requestId: string, mode: 'queue', content: { type: 'text', text: string }[] }, signal: AbortSignal) => Promise<unknown>
  follow: (request: { address: { kind: 'session', sessionId: string }, maxMessages: number }, signal: AbortSignal) => AsyncIterable<Snapshot | RecordEntry>
  page: (request: { address: { kind: 'session', sessionId: string }, throughSeq: number, beforeSeq: number, maxMessages: number }, signal: AbortSignal) => Promise<{ records: RecordEntry[], hasMore: boolean }>
}
interface Workspace { id: string, title: string, path?: string, sessionIds: readonly string[] }
export interface QQWorkspaceGrouping {
  workspaces: { c2c: { path: string }, group: { path: string } }
}
export interface QQConversationMetadata {
  summaries: (sessionIds: string[]) => Promise<Record<string, NonNullable<SessionSummary['source']>>>
  details: (sessionId: string) => Promise<SessionSummary['source']>
}
interface Registry {
  list: () => Workspace[]
  create: (path: string, title: string) => Promise<Workspace>
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown, maximum = 200) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : undefined
}

function modelRoute(value: unknown): ModelRoute | undefined {
  const route = record(value)
  const provider = text(route.provider, 200)
  const model = text(route.model, 200)
  if (!provider || !model)
    return
  return {
    provider,
    model,
    ...text(route.reasoningEffort, 200) ? { reasoningEffort: text(route.reasoningEffort, 200)! } : {},
  }
}

function projectedModelRoute(values: Record<string, unknown>) {
  const selection = record(values.modelSelection)
  return modelRoute(selection.next) ?? modelRoute(selection.lastUsed)
}

function providerGroups(value: unknown): ModelProviderGroup[] {
  if (!Array.isArray(value))
    return []
  return value.flatMap((item) => {
    const group = record(item)
    const id = text(group.id)
    const name = text(group.name)
    if (!id || !name || !Array.isArray(group.models))
      return []
    const models = group.models.flatMap((entry) => {
      const model = record(entry)
      const modelId = text(model.id)
      const modelName = text(model.name)
      const description = text(model.description, 1000)
      if (!modelId || !modelName)
        return []
      return [{
        id: modelId,
        name: modelName,
        ...description ? { description } : {},
      }]
    })
    return models.length ? [{ id, name, models }] : []
  })
}

function displayTitle(values: Record<string, unknown>, id: string) {
  const title = values.title
  if (typeof title === 'string' && title.trim())
    return title.slice(0, 160)
  const detail = record(title)
  for (const value of [detail.title, detail.value, detail.manual, detail.generated]) {
    if (typeof value === 'string' && value.trim())
      return value.slice(0, 160)
  }
  return id.slice(0, 8)
}

function sessionSource(workspace?: Workspace, grouping?: QQWorkspaceGrouping): SessionSummary['source'] {
  // Use the QQ adapter's directory identity, independent of editable titles.
  if (workspace?.path && grouping) {
    if (workspace.path === grouping.workspaces.c2c.path)
      return { platform: 'qq', kind: 'direct' }
    if (workspace.path === grouping.workspaces.group.path)
      return { platform: 'qq', kind: 'group' }
    return
  }
  const scope = workspace?.path?.replaceAll('\\', '/').match(/\/\.dsh-qqbot\/workspaces\/\d+\/(private|groups)\/?$/)?.[1]
  if (scope)
    return { platform: 'qq', kind: scope === 'groups' ? 'group' : 'direct' }
}

/** Uses DSH's public controller so viewing is cold-safe and prompting retains native admission and dedup. */
export class DshMobileHost implements MobileHost {
  private readonly controller: Controller
  private readonly workspaces: Registry
  private readonly creations = new Map<string, Promise<string>>()

  constructor(controller: unknown, workspaces: unknown, private readonly settings: MobileSettings, private readonly streamText: (stream: unknown[]) => string, private readonly qqGrouping?: () => QQWorkspaceGrouping | undefined, private readonly qqMetadata?: () => QQConversationMetadata | undefined) {
    for (const method of ['list', 'create', 'modelCatalog', 'selectModel', 'prompt', 'follow', 'page']) {
      if (typeof record(controller)[method] !== 'function')
        throw new Error(`DSH Session Controller capability is unavailable: ${method}`)
    }
    if (typeof record(workspaces).list !== 'function' || typeof record(workspaces).create !== 'function')
      throw new Error('DSH Workspace Registry is unavailable')
    this.controller = controller as Controller
    this.workspaces = workspaces as Registry
  }

  async list(signal: AbortSignal): Promise<SessionSummary[]> {
    const { items } = await this.controller.list({}, signal)
    const groups = new Map(this.workspaces.list().flatMap(workspace => workspace.sessionIds.map(id => [id, workspace] as const)))
    const grouping = this.qqGrouping?.()
    const metadata: Record<string, NonNullable<SessionSummary['source']>> = await this.qqMetadata?.()?.summaries(items.map(item => item.sessionId)).catch(() => ({})) ?? {}
    return items.filter(item => item.origin !== 'subagent').map((item) => {
      const values = item.projections?.values ?? {}
      const selection = projectedModelRoute(values)
      const workspace = groups.get(item.sessionId)
      const source = sessionSource(workspace, grouping)
      const detail = source && metadata[item.sessionId]?.kind === source.kind ? metadata[item.sessionId] : undefined
      return {
        id: item.sessionId,
        title: displayTitle(values, item.sessionId),
        updatedAt: new Date(Math.max(item.updatedAt, Date.parse(detail?.lastMessage?.createdAt ?? '') || 0)).toISOString(),
        running: item.running,
        workspace: workspace?.title,
        ...source ? { source: detail ?? source } : {},
        provider: selection?.provider,
        model: selection?.model,
      }
    })
  }

  async information(id: string, signal: AbortSignal): Promise<SessionSummary> {
    const session = (await this.list(signal)).find(row => row.id === id)
    if (!session)
      throw new MobileError(404, 'session_not_found')
    if (signal.aborted)
      throw signal.reason
    if (!session.source)
      return session
    const source = await this.qqMetadata?.()?.details(id).catch(() => undefined)
    if (signal.aborted)
      throw signal.reason
    return source?.kind === session.source.kind ? { ...session, source } : session
  }

  async conversation(id: string, signal: AbortSignal, before?: number): Promise<Conversation> {
    const session = (await this.list(signal)).find(row => row.id === id)
    if (!session)
      throw new MobileError(404, 'session_not_found')
    const lifetime = new AbortController()
    const stream = this.controller.follow({ address: { kind: 'session', sessionId: id }, maxMessages: 80 }, AbortSignal.any([signal, lifetime.signal]))
    const iterator = stream[Symbol.asyncIterator]()
    try {
      const first = await iterator.next()
      if (first.done || first.value.type !== 'snapshot')
        throw new MobileError(503, 'invalid_history_snapshot')
      const snapshot = first.value
      const page = before === undefined
        ? snapshot
        : await this.controller.page({
            address: { kind: 'session', sessionId: id },
            throughSeq: snapshot.cursor,
            beforeSeq: before,
            maxMessages: 80,
          }, signal)
      const messages = page.records.flatMap((entry): ChatMessage[] => {
        if (entry.type !== 'event')
          return []
        const event = entry.event
        if (event.type !== 'user/message' && event.type !== 'assistant/message')
          return []
        const data = record(event.data)
        const source = record(data.source)
        // DSH also logs injected context as user/message; it is not human chat.
        if (event.type === 'user/message' && source.kind !== 'user')
          return []
        let text = ''
        if (Array.isArray(data.stream))
          text = this.streamText(data.stream)
        else if (Array.isArray(data.content))
          text = data.content.map(block => record(block)).filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n')
        if (!text.trim())
          return []
        return [{ id: `${id}:${event.seq}`, role: event.type === 'user/message' ? 'user' : 'assistant', text: text.slice(0, 16000), createdAt: new Date(event.time).toISOString(), ...(source.kind === 'user' && typeof source.rpcId === 'string' ? { requestId: source.rpcId } : {}) }]
      })
      return { session, messages, hasMore: page.hasMore, cursor: page.records[0]?.event.seq ?? snapshot.cursor }
    }
    finally {
      lifetime.abort()
      // follow() observes our cancellation when its generator is closed.
      // Cancellation cleanup must not replace a valid snapshot or its original error.
      await iterator.return?.().catch(() => {})
    }
  }

  async prompt(id: string, text: string, requestId: string, signal: AbortSignal) {
    if (!(await this.list(signal)).some(row => row.id === id))
      throw new MobileError(404, 'session_not_found')
    await this.controller.prompt({ sessionId: id, requestId, mode: 'queue', content: [{ type: 'text', text }] }, signal)
  }

  async models(id: string, signal: AbortSignal): Promise<SessionModelCatalog> {
    const session = (await this.list(signal)).find(row => row.id === id)
    if (!session)
      throw new MobileError(404, 'session_not_found')
    if (signal.aborted)
      throw signal.reason
    const catalog = record(await this.controller.modelCatalog())
    const current = session.provider && session.model
      ? { provider: session.provider, model: session.model }
      : modelRoute(catalog.default)
    return {
      ...current ? { current } : {},
      groups: providerGroups(catalog.groups),
    }
  }

  async selectModel(id: string, route: ModelRoute, signal: AbortSignal): Promise<ModelRoute> {
    if (!(await this.list(signal)).some(row => row.id === id))
      throw new MobileError(404, 'session_not_found')
    if (signal.aborted)
      throw signal.reason
    try {
      const result = record(await this.controller.selectModel({ sessionId: id, ...route }))
      const selected = modelRoute(result.selected)
      if (!selected)
        throw new MobileError(503, 'invalid_model_selection')
      return selected
    }
    catch (error) {
      if (error instanceof MobileError)
        throw error
      const code = record(error).code
      if (code === 'session/model-unavailable')
        throw new MobileError(400, 'model_unavailable')
      throw error
    }
  }

  create(requestId: string) {
    const previous = this.creations.get(requestId)
    if (previous)
      return previous
    const creation = this.createSession().catch((error) => {
      this.creations.delete(requestId)
      throw error
    })
    this.creations.set(requestId, creation)
    if (this.creations.size > 200)
      this.creations.delete(this.creations.keys().next().value!)
    return creation
  }

  private async createSession() {
    const directory = this.settings.workspaceDirectory ?? join(homedir(), '.dsh-qqbot/workspace/mobile')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const workspace = await this.workspaces.create(directory, '小云 · 原生会话')
    // Supplying sessionId to DSH means resume, rather than allocate that ID.
    return (await this.controller.create({ workspaceId: workspace.id })).sessionId
  }

  async status(): Promise<BotStatus> {
    const result: BotStatus = { name: this.settings.botName ?? '小云 Bot', appId: this.settings.appId ?? '102275406', state: 'unknown', checkedAt: new Date().toISOString() }
    try {
      const directory = join(homedir(), '.dsh-qqbot')
      const [boot, runtime, grouping] = await Promise.all(['cloud-boot.json', 'cloud-runtime-status.json', 'workspace-grouping-status.json'].map(async name => record(JSON.parse(await readFile(join(directory, name), 'utf8')))))
      if (runtime.appId === result.appId && runtime.bootId === boot.id && runtime.pid === process.pid) {
        result.state = runtime.connected === true && grouping.phase === 'ready' ? 'online' : runtime.phase === 'loading' ? 'connecting' : 'offline'
      }
    }
    catch { /* Missing health capability remains unknown. */ }
    return result
  }
}
