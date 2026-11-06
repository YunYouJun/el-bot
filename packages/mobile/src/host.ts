import type { BotStatus, ChatMessage, Conversation, MobileHost, MobileSettings, SessionSummary } from './types'
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
  prompt: (request: { sessionId: string, requestId: string, mode: 'queue', content: { type: 'text', text: string }[] }, signal: AbortSignal) => Promise<unknown>
  follow: (request: { address: { kind: 'session', sessionId: string }, maxMessages: number }, signal: AbortSignal) => AsyncIterable<Snapshot | RecordEntry>
  page: (request: { address: { kind: 'session', sessionId: string }, throughSeq: number, beforeSeq: number, maxMessages: number }, signal: AbortSignal) => Promise<{ records: RecordEntry[], hasMore: boolean }>
}
interface Workspace { id: string, title: string, sessionIds: readonly string[] }
interface Registry {
  list: () => Workspace[]
  create: (path: string, title: string) => Promise<Workspace>
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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

/** Uses DSH's public controller so viewing is cold-safe and prompting retains native admission and dedup. */
export class DshMobileHost implements MobileHost {
  private readonly controller: Controller
  private readonly workspaces: Registry
  private readonly creations = new Map<string, Promise<string>>()

  constructor(controller: unknown, workspaces: unknown, private readonly settings: MobileSettings, private readonly streamText: (stream: unknown[]) => string) {
    for (const method of ['list', 'create', 'prompt', 'follow', 'page']) {
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
    const groups = new Map(this.workspaces.list().flatMap(workspace => workspace.sessionIds.map(id => [id, workspace.title] as const)))
    return items.filter(item => item.origin !== 'subagent').map((item) => {
      const values = item.projections?.values ?? {}
      const selection = record(record(values.modelSelection).next ?? record(values.modelSelection).lastUsed)
      return {
        id: item.sessionId,
        title: displayTitle(values, item.sessionId),
        updatedAt: new Date(item.updatedAt).toISOString(),
        running: item.running,
        workspace: groups.get(item.sessionId),
        provider: typeof selection.provider === 'string' ? selection.provider : undefined,
        model: typeof selection.model === 'string' ? selection.model : undefined,
      }
    })
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
        let text = ''
        if (Array.isArray(data.stream))
          text = this.streamText(data.stream)
        else if (Array.isArray(data.content))
          text = data.content.map(block => record(block)).filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n')
        if (!text.trim())
          return []
        return [{ id: `${id}:${event.seq}`, role: event.type === 'user/message' ? 'user' : 'assistant', text: text.slice(0, 16000), createdAt: new Date(event.time).toISOString() }]
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
    const workspace = await this.workspaces.create(directory, '云伯特 · 移动端')
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
