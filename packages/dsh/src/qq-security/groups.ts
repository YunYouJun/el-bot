import type { Scope } from '../qq-workspaces/contracts'
import type { Inbound, SecurityManager } from './contracts'
import type { QQConversationMetadata, QQConversationMetadataStore } from './metadata'
import type { QQSecurity } from './policy'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parsePeer } from '../qq-workspaces/grouping'

interface GroupRecord { membership: 'joined' | 'left' | 'unknown', updatedAt: number }
export interface BotGroup {
  id: string
  source: QQConversationMetadata
  membership: GroupRecord['membership']
  allowed: boolean
  sessionId?: string
}
export interface GroupCandidate {
  id: string
  name?: string
  membership: GroupRecord['membership']
}

/** Membership survives conversation rotation and deletion. */
export class QQGroupDirectory {
  private closed = false
  private groups = new Map<string, GroupRecord>()
  private saving: Promise<unknown> = Promise.resolve()
  manager?: SecurityManager
  isArchived?: (id: string) => boolean
  clearHistory?: (peerId: string) => void

  constructor(
    private readonly appId: string,
    private readonly path: string,
    private readonly preferences: string,
    private readonly policy: QQSecurity,
    private readonly metadata: QQConversationMetadataStore,
  ) {}

  async load() {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid QQ group directory')
      for (const [id, row] of Object.entries(value)) {
        const entry = row as GroupRecord
        if (!/^[\w-]{1,128}$/.test(id) || !['joined', 'left', 'unknown'].includes(entry?.membership) || !Number.isFinite(entry.updatedAt))
          throw new Error('Invalid QQ group directory entry')
        this.groups.set(id, entry)
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
    for (const key of Object.keys(await this.bindings())) {
      const peer = parsePeer(key, this.appId)
      if (peer?.scope === 'group' && !this.groups.has(peer.peerId))
        this.groups.set(peer.peerId, { membership: 'unknown', updatedAt: 0 })
    }
    await this.save()
  }

  observe(message: Inbound) {
    if (message.kind === 'group' && message.groupOpenid && message.messageId)
      this.record(message.groupOpenid, 'joined', Date.parse(message.timestamp ?? ''))
  }

  event(type: string, data: unknown) {
    if (type !== 'GROUP_ADD_ROBOT' && type !== 'GROUP_DEL_ROBOT')
      return
    const row = data && typeof data === 'object' ? data as Record<string, unknown> : {}
    if (typeof row.group_openid !== 'string')
      return
    this.record(row.group_openid, type === 'GROUP_ADD_ROBOT' ? 'joined' : 'left', Date.parse(String(row.timestamp ?? '')))
  }

  private record(id: string, membership: GroupRecord['membership'], timestamp: number) {
    if (this.closed || !/^[\w-]{1,128}$/.test(id) || (!this.groups.has(id) && this.groups.size >= 1024))
      return
    const updatedAt = Number.isFinite(timestamp) ? timestamp : Date.now()
    if ((this.groups.get(id)?.updatedAt ?? 0) > updatedAt)
      return
    this.groups.set(id, { membership, updatedAt })
    void this.save().catch(() => { /* The next list/close retries durable persistence. */ })
  }

  async list(): Promise<BotGroup[]> {
    await this.save()
    const bindings = await this.bindings()
    const groups = await Promise.all([...this.groups].map(async ([id, value]) => ({
      id,
      source: await this.metadata.groupProfile(id),
      membership: value.membership,
      allowed: value.membership !== 'left' && this.policy.allowed('group', id),
      sessionId: bindings[`qqbot:${this.appId}:group:${id}`],
    })))
    await this.metadata.flush()
    return groups
  }

  /** Cheap name lookup for owner tools; group profiles are refreshed by the visible list. */
  candidates(): GroupCandidate[] {
    return [...this.groups]
      .filter(([id, value]) => value.membership !== 'left' && this.policy.allowed('group', id))
      .map(([id, value]) => ({ id, name: this.metadata.groupName(id), membership: value.membership }))
  }

  async beforeOpen(scope: Scope, peerId: string) {
    const id = (await this.bindings())[`qqbot:${this.appId}:${scope}:${peerId}`]
    if (!id || !this.isArchived?.(id))
      return
    if (!this.manager)
      throw new Error('QQ session manager is unavailable')
    if (scope === 'group') {
      if (!this.clearHistory)
        throw new Error('QQ history cleanup is unavailable')
      this.clearHistory(peerId)
    }
    await this.metadata.clearMessage(scope, peerId)
    // Incoming traffic starts a fresh context; restoring before this point keeps
    // the original binding. A restored older history never replaces a newer chat.
    await this.manager.remove(scope, peerId)
  }

  canChat(id: string) {
    const group = this.groups.get(id)
    return Boolean(group && group.membership !== 'left' && this.policy.allowed('group', id))
  }

  async open(id: string): Promise<string> {
    const group = this.groups.get(id)
    if (!group || group.membership === 'left' || !this.policy.allowed('group', id))
      throw Object.assign(new Error('Group is unavailable'), { code: 'group_forbidden' })
    if (!this.manager)
      throw Object.assign(new Error('QQ is unavailable'), { code: 'groups_unavailable' })
    // Empty msgId is never used to send: opening only creates/resumes the peer's empty agent.
    const record = await this.manager.getOrCreate('group', id, this.policy.owner, { scope: 'group', targetId: id, msgId: '' })
    return record.sessionId
  }

  async currentSession(peerId: string) { return (await this.bindings())[`qqbot:${this.appId}:group:${peerId}`] }

  async sessionPeer(id: string) {
    const entry = Object.entries(await this.bindings()).find(([, value]) => value === id)
    return entry && parsePeer(entry[0], this.appId)
  }

  async withSession<T>(id: string, operation: (detach: (clear: boolean) => Promise<void>) => Promise<T>): Promise<T> {
    const find = async () => Object.entries(await this.bindings()).find(([, value]) => value === id)?.[0]
    const key = await find()
    const peer = key && parsePeer(key, this.appId)
    if (!peer)
      return operation(async () => {})
    return this.policy.manage(peer.scope, peer.peerId, async () => {
      if (await find() !== key)
        return operation(async () => {})
      return operation(async (clear) => {
        if (!this.manager)
          throw new Error('QQ session manager is unavailable')
        const live = this.manager.getSessionRecord?.(peer.scope, peer.peerId)
        if (live && live.sessionId !== id)
          throw new Error('QQ session binding changed')
        if (live && live.agent.status !== 'idle')
          throw Object.assign(new Error('Session is active'), { code: 'session_active' })
        if (clear) {
          if (peer.scope === 'group') {
            if (!this.clearHistory)
              throw new Error('QQ history cleanup is unavailable')
            this.clearHistory(peer.peerId)
          }
          await this.metadata.clearMessage(peer.scope, peer.peerId)
        }
        await this.manager.remove(peer.scope, peer.peerId)
      })
    })
  }

  async close() {
    this.closed = true
    await this.saving
  }

  private async bindings(): Promise<Record<string, string>> {
    try {
      const document = JSON.parse(await readFile(this.preferences, 'utf8')) as { sessionIds?: Record<string, unknown> }
      return Object.fromEntries(Object.entries(document.sessionIds ?? {}).filter((row): row is [string, string] => typeof row[1] === 'string'))
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return {}
      throw error
    }
  }

  private save() {
    const json = `${JSON.stringify(Object.fromEntries(this.groups))}\n`
    const task = this.saving.catch(() => {}).then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      await writeFile(`${this.path}.tmp`, json, { mode: 0o600 })
      await rename(`${this.path}.tmp`, this.path)
    })
    this.saving = task
    return task
  }
}
