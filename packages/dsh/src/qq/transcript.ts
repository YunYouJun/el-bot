import type { TransportAttachment } from './attachments'
import type { Inbound } from './contracts'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { storedAttachments, transportAttachments } from './attachments'

export interface TransportMessage {
  id: string
  seq: number
  direction: 'incoming' | 'outgoing'
  text: string
  kind: string
  createdAt: string
  senderId?: string
  senderName?: string
  senderRole?: 'owner' | 'admin' | 'member'
  manual?: boolean
  status?: 'pending' | 'sent' | 'failed' | 'unknown'
  messageId?: string
  attachments?: TransportAttachment[]
}
export interface TranscriptMember {
  senderId: string
  senderName?: string
  senderRole?: 'owner' | 'admin' | 'member'
  lastMessageAt: string
  messageCount: number
}
interface Document { startedAt: string, next: number, messages: TransportMessage[] }
interface Index { version: 1, current: Record<string, string>, sessions: Record<string, string> }
const key = (value: string) => createHash('sha256').update(value).digest('hex')
const empty = (): Document => ({ startedAt: new Date().toISOString(), next: 1, messages: [] })
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
function memberRole(value: unknown): TransportMessage['senderRole'] {
  return value === 'owner' || value === 'admin' || value === 'member' ? value : undefined
}

/** Only authenticated inbound events and actual SDK send attempts enter this ledger. */
export class QQTranscript {
  private index: Index = { version: 1, current: Object.create(null), sessions: Object.create(null) }
  private tail: Promise<unknown> = Promise.resolve()
  private documents = new Map<string, Document>()
  isArchived: (id: string) => boolean = () => false

  constructor(private readonly directory: string, private readonly allowed: (peer: string) => boolean) {}

  async load() {
    try {
      const value = JSON.parse(await readFile(join(this.directory, 'index.json'), 'utf8')) as Index
      if (value.version !== 1 || !object(value.current) || !object(value.sessions)
        || Object.entries(value.current).some(([peer, id]) => !/^[\w-]{1,128}$/.test(peer) || typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id))
        || Object.entries(value.sessions).some(([id, peer]) => !/^[\w-]{1,128}$/.test(id) || typeof peer !== 'string' || !/^[\w-]{1,128}$/.test(peer))
        || Object.entries(value.current).some(([peer, id]) => value.sessions[id] !== peer)) {
        throw new Error('Invalid QQ transcript index')
      }
      this.index = { version: 1, current: Object.assign(Object.create(null), value.current), sessions: Object.assign(Object.create(null), value.sessions) }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
  }

  peer(id: string) {
    const peer = Object.hasOwn(this.index.sessions, id) ? this.index.sessions[id] : undefined
    return peer && this.allowed(peer) ? peer : undefined
  }

  sources() {
    return Object.fromEntries(Object.entries(this.index.sessions).filter(([, peer]) => this.allowed(peer)))
  }

  bind(peer: string, id: string, anchor?: string) {
    return this.serial(async () => {
      if (!this.allowed(peer) || !/^[\w-]{1,128}$/.test(id))
        return
      const previous = this.index.current[peer]
      if (this.index.sessions[id] && this.index.sessions[id] !== peer)
        throw new Error('QQ transcript ownership mismatch')
      const next = await this.document(id)
      let movedFrom: Document | undefined
      if (previous && previous !== id && anchor) {
        const old = await this.document(previous)
        const moved = old.messages.find(row => row.id === `in:${anchor}`)
        if (moved) {
          old.messages = old.messages.filter(row => row !== moved)
          this.append(next, moved)
          movedFrom = old
        }
      }
      const pendingKey = `pending:${peer}`
      const pending = await this.document(pendingKey)
      if (previous === id && pending.messages.length === 0)
        return
      for (const entry of pending.messages) this.append(next, entry)
      await this.save(id, next)
      if (previous && movedFrom)
        await this.save(previous, movedFrom)
      this.index.current[peer] = id
      this.index.sessions[id] = peer
      await this.write('index.json', this.index)
      this.documents.delete(pendingKey)
      await rm(this.file(pendingKey), { force: true })
    })
  }

  inbound(message: Inbound) {
    const peer = message.groupOpenid
    if (!peer || message.kind !== 'group' || !this.allowed(peer) || !message.messageId)
      return Promise.resolve()
    // Copy now: downstream middleware mutates content and strips attachments.
    const raw = object(message.raw) ? message.raw : {}
    const author = object(raw.author) ? raw.author : {}
    const source = Array.isArray(message.attachments) && message.attachments.length ? message.attachments : raw.attachments
    const attachments = transportAttachments(source)
    const entry = {
      id: `in:${message.messageId.slice(0, 512)}`,
      direction: 'incoming' as const,
      text: String(message.content ?? '').slice(0, 4000),
      kind: attachments?.length ? 'attachment' : 'text',
      attachments,
      createdAt: Number.isFinite(Date.parse(message.timestamp ?? '')) ? new Date(message.timestamp!).toISOString() : new Date().toISOString(),
      senderId: message.senderId.slice(0, 128),
      senderName: message.senderName?.slice(0, 160),
      senderRole: memberRole(author.member_role),
      messageId: message.messageId.slice(0, 512),
    }
    return this.serial(async () => {
      const current = this.index.current[peer]
      const id = current && !this.isArchived(current) ? current : `pending:${peer}`
      const document = await this.document(id)
      if (document.messages.some(row => row.messageId === entry.messageId))
        return
      this.append(document, entry)
      await this.save(id, document)
    })
  }

  async send<T>(peer: string, text: string, manual: boolean, operation: () => Promise<T>): Promise<T> {
    const entryId = randomUUID()
    const id = await this.serial(async () => {
      const id = this.index.current[peer]
      if (!this.allowed(peer) || !id || this.isArchived(id))
        throw new Error('QQ transcript has no active binding')
      const document = await this.document(id)
      this.append(document, { id: entryId, direction: 'outgoing', text: text.slice(0, 16000), kind: 'text', manual, status: 'pending', createdAt: new Date().toISOString() })
      await this.save(id, document)
      return id
    })
    try {
      const response = await operation()
      const messageId = object(response) && typeof response.id === 'string' ? response.id.slice(0, 512) : undefined
      await this.finish(id, entryId, messageId ? 'sent' : 'unknown', messageId)
      return response
    }
    catch (error) {
      const value = object(error) ? error : {}
      const definitive = typeof value.bizCode === 'number' || typeof value.bizCode === 'string'
        || (typeof value.httpStatus === 'number' && value.httpStatus >= 400 && value.httpStatus < 500)
      await this.finish(id, entryId, definitive ? 'failed' : 'unknown')
      throw error
    }
  }

  /** Incoming text in one window, aggregated across rotated sessions for this peer. */
  recent(peer: string, since: number, until: number, maxMessages: number) {
    return this.serial(async () => {
      if (!this.allowed(peer) || !Number.isFinite(since) || !Number.isFinite(until) || since >= until)
        throw new Error('QQ transcript is unavailable')
      const sessions = Object.entries(this.index.sessions)
        .filter(([id, value]) => value === peer && !this.isArchived(id))
        .map(([id]) => id)
        .slice(-20)
      const rows: TransportMessage[] = []
      for (const id of sessions) {
        const document = await this.document(id)
        for (const row of document.messages) {
          if (row.direction !== 'incoming' || !row.text.trim())
            continue
          const at = Date.parse(row.createdAt)
          if (Number.isFinite(at) && at >= since && at <= until)
            rows.push(row)
        }
      }
      const seen = new Set<string>()
      return rows
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .filter((row) => {
          if (seen.has(row.id))
            return false
          seen.add(row.id)
          return true
        })
        .slice(-Math.max(1, Math.min(maxMessages, 500)))
        .map(row => ({
          text: row.text.slice(0, 2000),
          ...(row.senderName ? { senderName: row.senderName } : {}),
          senderId: row.senderId,
          createdAt: row.createdAt,
        }))
    })
  }

  /** Distinct senders in this peer's retained history, most recently active first. */
  members(peer: string, maxMembers = 200) {
    return this.serial(async () => {
      if (!this.allowed(peer) || !Number.isFinite(maxMembers) || maxMembers < 1)
        throw new Error('QQ transcript is unavailable')
      const sessions = Object.entries(this.index.sessions)
        .filter(([id, value]) => value === peer && !this.isArchived(id))
        .map(([id]) => id)
        .slice(-20)
      const rows = new Map<string, TranscriptMember>()
      const seen = new Set<string>()
      for (const id of sessions) {
        const document = await this.document(id)
        for (const row of document.messages) {
          if (row.direction !== 'incoming' || !row.senderId)
            continue
          const key = row.messageId ?? row.id
          if (seen.has(key))
            continue
          seen.add(key)
          const previous = rows.get(row.senderId)
          rows.set(row.senderId, {
            senderId: row.senderId,
            ...(row.senderName ? { senderName: row.senderName } : previous?.senderName ? { senderName: previous.senderName } : {}),
            ...(row.senderRole ? { senderRole: row.senderRole } : previous?.senderRole ? { senderRole: previous.senderRole } : {}),
            lastMessageAt: !previous || row.createdAt > previous.lastMessageAt ? row.createdAt : previous.lastMessageAt,
            messageCount: (previous?.messageCount ?? 0) + 1,
          })
        }
      }
      return [...rows.values()]
        .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt))
        .slice(0, Math.min(500, Math.floor(maxMembers)))
    })
  }

  page(id: string, before?: number) {
    return this.serial(async () => {
      if (!this.peer(id))
        throw new Error('QQ transcript is unavailable')
      const document = await this.document(id)
      const rows = document.messages.filter(row => before === undefined || row.seq < before)
      const messages = rows.slice(-80)
      return { messages, cursor: messages[0]?.seq ?? document.next, hasMore: rows.length > messages.length, captureStartedAt: document.startedAt }
    })
  }

  clear(id: string) {
    return this.serial(async () => {
      const peer = this.index.sessions[id]
      this.documents.delete(id)
      await rm(this.file(id), { force: true })
      delete this.index.sessions[id]
      if (peer && this.index.current[peer] === id) {
        delete this.index.current[peer]
        this.documents.delete(`pending:${peer}`)
        await rm(this.file(`pending:${peer}`), { force: true })
      }
      await this.write('index.json', this.index)
    })
  }

  async close() { await this.tail }

  private finish(id: string, entryId: string, status: TransportMessage['status'], messageId?: string) {
    return this.serial(async () => {
      if (!this.peer(id))
        return
      const document = await this.document(id)
      const row = document.messages.find(row => row.id === entryId)
      if (row) {
        row.status = status
        row.messageId = messageId
        await this.save(id, document)
      }
    })
  }

  private append(document: Document, entry: Omit<TransportMessage, 'seq'>) {
    if (!document.messages.some(row => row.id === entry.id))
      document.messages.push({ ...entry, seq: document.next++ })
    document.messages = document.messages.slice(-1000)
  }

  private async document(id: string): Promise<Document> {
    const cached = this.documents.get(id)
    if (cached)
      return cached
    let document = empty()
    try {
      if ((await stat(this.file(id))).size > 8 * 1024 * 1024)
        throw new Error('Oversized QQ transcript')
      const value = JSON.parse(await readFile(this.file(id), 'utf8')) as Document
      if (!Array.isArray(value.messages) || !Number.isSafeInteger(value.next) || value.next < 1 || !Number.isFinite(Date.parse(value.startedAt))
        || value.messages.some(row => !row || typeof row.id !== 'string' || !Number.isSafeInteger(row.seq) || typeof row.text !== 'string'
          || !['incoming', 'outgoing'].includes(row.direction) || !Number.isFinite(Date.parse(row.createdAt)))) {
        throw new Error('Invalid QQ transcript')
      }
      document = {
        startedAt: value.startedAt,
        next: value.next,
        messages: value.messages.map(row => ({
          id: row.id,
          seq: row.seq,
          direction: row.direction,
          text: row.text,
          kind: row.kind,
          createdAt: row.createdAt,
          senderId: row.senderId,
          senderName: row.senderName,
          senderRole: memberRole(row.senderRole),
          manual: row.manual,
          status: row.status,
          messageId: row.messageId,
          attachments: storedAttachments(row.attachments),
        })),
      }
      for (const row of document.messages) {
        if (row.status === 'pending')
          row.status = 'unknown'
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
    if (this.documents.size >= 64)
      this.documents.delete(this.documents.keys().next().value!)
    this.documents.set(id, document)
    return document
  }

  private file(id: string) { return join(this.directory, `${key(id)}.json`) }
  private async save(id: string, document: Document) {
    while (Buffer.byteLength(JSON.stringify(document)) > 2 * 1024 * 1024 && document.messages.length > 1) document.messages.shift()
    await this.write(`${key(id)}.json`, document)
  }

  private async write(name: string, value: unknown) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const path = join(this.directory, name)
    await writeFile(`${path}.tmp`, `${JSON.stringify(value)}\n`, { mode: 0o600 })
    await rename(`${path}.tmp`, path)
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.tail.catch(() => {}).then(operation)
    this.tail = task
    return task
  }
}
