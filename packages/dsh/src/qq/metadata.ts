import type { Scope } from '../qq-workspaces/contracts'
import type { Inbound } from './contracts'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parsePeer } from '../qq-workspaces/grouping'

type Access = 'available' | 'forbidden' | 'unavailable'
export interface QQConversationMetadata {
  platform: 'qq'
  kind: 'direct' | 'group'
  appId: string
  peerId: string
  name?: string
  description?: string
  category?: string
  tags?: string[]
  memberCount?: number
  groupInfoStatus?: Access
  botStateStatus?: Access
  bot?: { joinedAt?: string, role?: string, receiveMode?: string, allowProactive?: boolean }
  lastMessage?: {
    id: string
    senderId: string
    senderName?: string
    senderRole?: string
    senderIsBot?: boolean
    text: string
    createdAt: string
    type: 'text' | 'image' | 'voice' | 'video' | 'file' | 'card' | 'quote'
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function text(value: unknown, limit = 160) {
  return typeof value === 'string' && value.trim() ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, limit) : undefined
}
function date(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined
}
function role(value: unknown) {
  return value === 'owner' || value === 'admin' || value === 'member' ? value : undefined
}
function access(error: unknown): Access {
  const value = object(error)
  return [value.bizCode, value.code].includes(11253) || value.httpStatus === 403 ? 'forbidden' : 'unavailable'
}

/** Owner-only display metadata. Never retain raw events, auth tokens or attachment URLs. */
export class QQConversationMetadataStore {
  private readonly peers = new Map<string, QQConversationMetadata>()
  private readonly refreshed = new Map<string, number>()
  private readonly pending = new Map<string, Promise<void>>()
  private requests: number[] = []
  private read?: (path: string) => Promise<unknown>
  private saving: Promise<unknown> = Promise.resolve()
  private timer?: ReturnType<typeof setTimeout>

  constructor(
    private readonly appId: string,
    private readonly path: string,
    private readonly preferencesFile: string,
    private readonly allowed: (scope: Scope, peer: string) => boolean,
    private readonly now = Date.now,
  ) {}

  bind(read: (path: string) => Promise<unknown>) { this.read = read }

  async load() {
    try {
      if ((await stat(this.path)).size > 1024 * 1024)
        return
      // Re-project persisted data through the same admission checks as a live event.
      const values = object(JSON.parse(await readFile(this.path, 'utf8')))
      for (const [key, entry] of Object.entries(values).slice(0, 1025)) {
        const peer = parsePeer(key, this.appId)
        if (!peer)
          continue
        const value = object(entry)
        this.peers.set(key, {
          platform: 'qq',
          kind: peer.scope === 'group' ? 'group' : 'direct',
          appId: this.appId,
          peerId: peer.peerId,
          name: text(value.name),
          description: text(value.description, 1000),
          category: text(value.category),
        })
        if (!this.allowed(peer.scope, peer.peerId))
          continue
        const message = object(value.lastMessage)
        this.observe({
          kind: peer.scope,
          senderId: String(message.senderId ?? peer.peerId),
          groupOpenid: peer.scope === 'group' ? peer.peerId : undefined,
          messageId: String(message.id ?? ''),
          content: String(message.text ?? ''),
          timestamp: String(message.createdAt ?? ''),
          senderName: text(message.senderName),
          senderIsBot: typeof message.senderIsBot === 'boolean' ? message.senderIsBot : undefined,
          raw: {
            author: { member_role: role(message.senderRole) },
            message_type: message.type === 'card' ? 3 : message.type === 'quote' ? 103 : 0,
            attachments: ['image', 'voice', 'video', 'file'].includes(String(message.type))
              ? [{ content_type: message.type === 'image' ? 'image/jpeg' : message.type === 'video' ? 'video/mp4' : message.type }]
              : [],
          },
        }, false)
      }
    }
    catch { /* Optional display metadata must not prevent bot startup. */ }
  }

  observe(message: Inbound, persist = true) {
    const scope = message.kind === 'c2c' ? 'c2c' : message.kind === 'group' ? 'group' : undefined
    const peerId = scope === 'group' ? message.groupOpenid : message.senderId
    if (!scope || !peerId || !this.allowed(scope, peerId) || typeof message.messageId !== 'string' || !message.messageId || typeof message.senderId !== 'string')
      return
    const createdAt = date(message.timestamp)
    if (!createdAt)
      return
    const key = `qqbot:${this.appId}:${scope}:${peerId}`
    const previous = this.peers.get(key)
    if (previous?.lastMessage && previous.lastMessage.createdAt > createdAt)
      return
    const raw = object(message.raw)
    const author = object(raw.author)
    const attachments = Array.isArray(raw.attachments) ? raw.attachments : []
    const mime = text(object(attachments[0]).content_type) ?? ''
    const type = raw.message_type === 103
      ? 'quote'
      : raw.message_type === 3
        ? 'card'
        : mime.startsWith('image/')
          ? 'image'
          : mime === 'voice' || mime.startsWith('audio/')
            ? 'voice'
            : mime.startsWith('video/') ? 'video' : attachments.length ? 'file' : 'text'
    const senderName = text(message.senderName) ?? text(author.username)
    this.peers.set(key, {
      ...previous,
      platform: 'qq',
      kind: scope === 'group' ? 'group' : 'direct',
      appId: this.appId,
      peerId,
      ...(scope === 'c2c' && senderName ? { name: senderName } : {}),
      lastMessage: {
        id: message.messageId.slice(0, 1024),
        senderId: message.senderId.slice(0, 128),
        senderName,
        senderRole: role(author.member_role),
        senderIsBot: message.senderIsBot,
        text: text(message.content) ?? '',
        createdAt,
        type,
      },
    })
    if (persist && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined
        void this.save()
      }, 500)
      this.timer.unref()
    }
  }

  async groupProfile(peerId: string): Promise<QQConversationMetadata> {
    const key = `qqbot:${this.appId}:group:${peerId}`
    const value = this.peers.get(key) ?? { platform: 'qq', kind: 'group', appId: this.appId, peerId }
    if (this.read)
      await this.refreshProfile(key, value)
    const { lastMessage: _message, ...profile } = this.peers.get(key) ?? value
    return profile
  }

  groupName(peerId: string): string | undefined {
    return this.peers.get(`qqbot:${this.appId}:group:${peerId}`)?.name
  }

  async flush() { await this.save() }

  async clearMessage(scope: Scope, peerId: string) {
    const key = `qqbot:${this.appId}:${scope}:${peerId}`
    const current = this.peers.get(key)
    if (current) {
      const { lastMessage: _message, ...profile } = current
      this.peers.set(key, profile)
      await this.save()
    }
  }

  async summaries(sessionIds: string[]): Promise<Record<string, QQConversationMetadata>> {
    const result: Record<string, QQConversationMetadata> = {}
    try {
      if ((await stat(this.preferencesFile)).size > 2 * 1024 * 1024)
        return result
      const preferences = object(JSON.parse(await readFile(this.preferencesFile, 'utf8')))
      const ids = new Set(sessionIds)
      for (const [key, id] of Object.entries(object(preferences.sessionIds))) {
        const peer = parsePeer(key, this.appId)
        if (!peer || typeof id !== 'string' || !ids.has(id) || !this.allowed(peer.scope, peer.peerId))
          continue
        const value = this.peers.get(key) ?? { platform: 'qq', kind: peer.scope === 'group' ? 'group' : 'direct', appId: this.appId, peerId: peer.peerId }
        result[id] = value
        if (value.kind === 'group' && this.read)
          void this.refreshProfile(key, value)
      }
    }
    catch { /* The session list remains usable without QQ preferences. */ }
    return result
  }

  async details(sessionId: string): Promise<QQConversationMetadata | undefined> {
    const value = (await this.summaries([sessionId]))[sessionId]
    if (!value || value.kind !== 'group' || !this.read)
      return value
    const key = `qqbot:${this.appId}:group:${value.peerId}`
    await this.refreshProfile(key, value)
    // Re-check admission after asynchronous API calls.
    return this.allowed('group', value.peerId) ? this.peers.get(key) : undefined
  }

  private async refreshProfile(key: string, value: QQConversationMetadata) {
    if ((this.refreshed.get(key) ?? 0) <= this.now() && this.read) {
      let task = this.pending.get(key)
      if (!task) {
        task = this.refresh(key, value).finally(() => this.pending.delete(key))
        this.pending.set(key, task)
      }
      await task
    }
  }

  private async refresh(key: string, value: QQConversationMetadata) {
    this.requests = this.requests.filter(time => time > this.now() - 60_000)
    if (this.requests.length > 26) {
      this.peers.set(key, { ...value, groupInfoStatus: 'unavailable', botStateStatus: 'unavailable' })
      this.refreshed.set(key, this.now() + 60_000)
      return
    }
    this.requests.push(this.now(), this.now())
    const path = `/v2/groups/${encodeURIComponent(value.peerId)}`
    const [info, state] = await Promise.allSettled([this.read!(`${path}/info`), this.read!(`${path}/bot_state`)])
    const group = info.status === 'fulfilled' ? object(info.value) : {}
    const bot = state.status === 'fulfilled' ? object(state.value) : {}
    const groupInfoStatus = info.status === 'fulfilled' ? 'available' : access(info.reason)
    const botStateStatus = state.status === 'fulfilled' ? 'available' : access(state.reason)
    this.peers.set(key, {
      ...this.peers.get(key) ?? value,
      name: text(group.group_name) ?? value.name,
      description: text(group.group_finger_memo, 1000),
      category: text(group.group_class_text),
      tags: Array.isArray(group.group_tags) ? group.group_tags.slice(0, 12).flatMap(item => text(item, 40) ?? []) : undefined,
      memberCount: Number.isSafeInteger(group.group_member_num) && Number(group.group_member_num) >= 0 ? Number(group.group_member_num) : undefined,
      groupInfoStatus,
      botStateStatus,
      bot: state.status === 'fulfilled'
        ? {
            joinedAt: date(bot.joined_at),
            role: role(bot.member_role),
            receiveMode: ['all', 'only_mention', 'mention_and_context'].includes(String(bot.recv_msg_setting)) ? String(bot.recv_msg_setting) : undefined,
            allowProactive: typeof bot.allow_proactive_msg === 'boolean' ? bot.allow_proactive_msg : undefined,
          }
        : undefined,
    })
    const delay = [groupInfoStatus, botStateStatus].includes('unavailable')
      ? 60_000
      : [groupInfoStatus, botStateStatus].includes('forbidden') ? 6 * 60 * 60_000 : 5 * 60_000
    this.refreshed.set(key, this.now() + delay)
  }

  private save() {
    const task = this.saving.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      // Persist only the bounded last inbound message; profiles refresh on demand.
      const values = Object.fromEntries([...this.peers].map(([key, value]) => [key, { lastMessage: value.lastMessage }]))
      await writeFile(`${this.path}.tmp`, JSON.stringify(values), { mode: 0o600 })
      await rename(`${this.path}.tmp`, this.path)
    })
    this.saving = task.catch(() => {})
    return this.saving
  }

  async close() {
    clearTimeout(this.timer)
    this.timer = undefined
    this.read = undefined
    await this.save()
  }
}
