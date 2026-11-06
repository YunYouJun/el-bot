import type { Delivery, Lease, ManualPreview, ManualRequest, ManualStateView, ManualTarget, SendMode } from './manual-types'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ManualError } from './manual-types'

export interface ManualBridge {
  targets: () => Promise<ManualTarget[]>
  drain: (target: ManualTarget) => Promise<void>
  quota: (target: ManualTarget) => Promise<boolean>
  send: (target: ManualTarget, text: string, mode: SendMode, msgId?: string) => Promise<unknown>
  reserveReply: (target: ManualTarget, messageId: string) => Promise<void> | void
}
interface DiskState { version: 1, leases: Record<string, Lease>, deliveries: Record<string, Delivery> }
interface Preview extends ManualPreview { lease: string, sessionId: string, msgId?: string }
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const DAY = 86_400_000
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)

/** Owner HTTP owns this service; it is never registered as a model tool. */
export class ManualControl {
  private state: DiskState = { version: 1, leases: {}, deliveries: {} }
  private previews = new Map<string, Preview>()
  private recent = new Map<string, { text: string, receivedAt: number }[]>()
  private anchors = new Map<string, { id: string, expiresAt: number }>()
  private fresh = new Map<string, Set<string>>()
  private seen = new Map<string, Set<string>>()
  private sessions = new Map<string, string>()
  private queue: Promise<unknown> = Promise.resolve()
  private sends = new Map<string, Promise<Delivery>>()
  private closed = false
  online = false

  constructor(readonly path: string, private readonly bridge: ManualBridge, private readonly now = Date.now) {}

  async initialize() {
    try {
      if ((await stat(this.path)).size > 2 * 1024 * 1024)
        throw new Error('oversized journal')
      const data = JSON.parse(await readFile(this.path, 'utf8')) as DiskState
      const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
      if (data.version !== 1 || !object(data.leases) || !object(data.deliveries)
        || Object.keys(data.leases).length > 64 || Object.keys(data.deliveries).length > 2000
        || Object.entries(data.leases).some(([key, lease]) => !/^[a-f0-9]{64}$/.test(key) || !lease
          || !uuid(lease.id) || !Number.isSafeInteger(lease.expiresAt)
          || !['active', 'pausing'].includes(lease.phase))
        || Object.entries(data.deliveries).some(([key, value]) => !value || !uuid(value.id) || key !== value.id
          || !/^[a-f0-9]{64}$/.test(value.target) || !/^[a-f0-9]{64}$/.test(value.textHash)
          || !['reply', 'proactive'].includes(value.mode) || !['pending', 'sent', 'failed', 'unknown'].includes(value.status)
          || !Number.isSafeInteger(value.createdAt))) {
        throw new Error('invalid journal')
      }
      this.state = data
      // A previous process cannot still be draining or own a live network operation.
      for (const lease of Object.values(data.leases))
        lease.phase = 'active'
      for (const delivery of Object.values(data.deliveries)) {
        if (delivery.status === 'pending') {
          delivery.status = 'unknown'
          delivery.code = 'delivery_unknown'
        }
      }
      if (Object.values(data.leases).some(lease => lease.expiresAt > this.now())) {
        for (const target of await this.bridge.targets())
          this.sessions.set(target.sessionId, target.id)
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new ManualError(503, 'journal_unavailable')
    }
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task)
    this.queue = result.catch(() => {})
    return result
  }

  private async save() {
    this.state.deliveries = Object.fromEntries(Object.entries(this.state.deliveries).filter(([, value]) => value.createdAt > this.now() - DAY))
    if (Object.keys(this.state.deliveries).length > 2000 || Object.keys(this.state.leases).length > 64)
      throw new ManualError(503, 'journal_unavailable')
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      await writeFile(temporary, `${JSON.stringify(this.state)}\n`, { flag: 'wx', mode: 0o600 })
      await rename(temporary, this.path)
    }
    catch {
      this.closed = true
      throw new ManualError(503, 'journal_unavailable')
    }
    finally { await unlink(temporary).catch(() => {}) }
  }

  paused(id: string): boolean {
    return this.closed || (this.state.leases[id]?.expiresAt ?? 0) > this.now()
  }

  pausedSession(sessionId: string) {
    const id = this.sessions.get(sessionId)
    return Boolean(id && this.paused(id))
  }

  automaticAllowed(id: string, msgId?: string) {
    if (this.paused(id))
      return false
    // After a handoff, old buffered output cannot leak into the resumed chat.
    return !this.state.leases[id] || Boolean(msgId && this.fresh.get(id)?.has(msgId))
  }

  observe(id: string, messageId: string, text: string, canReply: boolean) {
    const seen = this.seen.get(id) ?? new Set<string>()
    if (seen.has(messageId))
      return false
    seen.add(messageId)
    if (seen.size > 256)
      seen.delete(seen.values().next().value!)
    this.seen.set(id, seen)
    const entries = this.recent.get(id) ?? []
    entries.push({ text: text.slice(0, 2000), receivedAt: this.now() })
    this.recent.set(id, entries.slice(-10))
    if (canReply)
      this.anchors.set(id, { id: messageId, expiresAt: this.now() + 240_000 })
    if (!this.paused(id)) {
      const accepted = this.fresh.get(id) ?? new Set<string>()
      accepted.add(messageId)
      if (accepted.size > 128)
        accepted.delete(accepted.values().next().value!)
      this.fresh.set(id, accepted)
    }
    return true
  }

  private async target(id: string) {
    const target = (await this.bridge.targets()).find(row => row.id === id)
    if (!target)
      throw new ManualError(404, 'not_found')
    this.sessions.set(target.sessionId, target.id)
    return target
  }

  private lease(id: string, token: string) {
    const lease = this.state.leases[id]
    if (!lease || lease.id !== token || lease.expiresAt <= this.now())
      throw new ManualError(409, 'lease_expired')
    return lease
  }

  async view(): Promise<ManualStateView> {
    return {
      now: this.now(),
      online: this.online && !this.closed,
      sessions: (await this.bridge.targets()).map(({ peerId: _peer, ...target }) => ({
        ...target,
        lease: this.paused(target.id) ? this.state.leases[target.id] : undefined,
        replyAvailable: (this.anchors.get(target.id)?.expiresAt ?? 0) > this.now(),
        proactivePermission: this.permission(target.id),
        recent: this.recent.get(target.id) ?? [],
      })),
      deliveries: Object.values(this.state.deliveries).reverse().sort((a, b) => b.createdAt - a.createdAt).slice(0, 30),
    }
  }

  private permission(target: string): 'unknown' | 'allowed' | 'denied' {
    const latest = Object.values(this.state.deliveries).reverse().filter(row => row.target === target && row.mode === 'proactive').sort((a, b) => b.createdAt - a.createdAt)[0]
    return latest?.status === 'sent' ? 'allowed' : latest?.code === '40034105' ? 'denied' : 'unknown'
  }

  async request(input: ManualRequest): Promise<ManualStateView | ManualPreview | Delivery> {
    if (!input || typeof input !== 'object' || this.closed)
      throw new ManualError(503, 'unavailable')
    if (input.operation === 'list')
      return this.view()
    if (!this.online)
      throw new ManualError(503, 'unavailable')
    if (input.operation === 'send') {
      if (!uuid(input.preview))
        throw new ManualError(400, 'invalid_request')
      const previous = this.sends.get(input.preview)
      if (previous)
        return previous
      const pending = this.send(input.preview)
      this.sends.set(input.preview, pending)
      try {
        return await pending
      }
      finally { this.sends.delete(input.preview) }
    }
    return this.serial(async () => {
      if (!('target' in input) || typeof input.target !== 'string')
        throw new ManualError(400, 'invalid_request')
      const target = await this.target(input.target)
      if (input.operation === 'begin') {
        const seconds = input.seconds ?? 600
        if (!Number.isSafeInteger(seconds) || seconds < 30 || seconds > 1800)
          throw new ManualError(400, 'invalid_duration')
        if (this.paused(target.id))
          return this.view()
        this.state.leases[target.id] = { id: randomUUID(), expiresAt: this.now() + seconds * 1000, phase: 'pausing' }
        this.fresh.delete(target.id)
        await this.save()
        try {
          await this.bridge.drain(target)
          this.state.leases[target.id].phase = 'active'
          await this.save()
        }
        catch { throw new ManualError(409, 'still_pausing') }
        return this.view()
      }
      if (input.operation === 'end') {
        this.lease(target.id, input.lease)
        if (Object.values(this.state.deliveries).some(row => row.target === target.id && row.status === 'pending'))
          throw new ManualError(409, 'send_in_progress')
        this.state.leases[target.id].expiresAt = this.now()
        await this.save()
        return this.view()
      }
      if (input.operation !== 'preview')
        throw new ManualError(400, 'invalid_request')
      const lease = this.lease(target.id, input.lease)
      if (lease.phase !== 'active')
        throw new ManualError(409, 'still_pausing')
      if (typeof input.text !== 'string' || !input.text.trim() || !input.text.isWellFormed() || input.text.length > 1200 || Buffer.byteLength(input.text) > 4800
        || [...input.text].some(char => (char.charCodeAt(0) < 32 && !['\t', '\r', '\n'].includes(char)) || char.charCodeAt(0) === 127)) {
        throw new ManualError(400, 'invalid_text')
      }
      if (!['proactive', 'reply'].includes(input.mode))
        throw new ManualError(400, 'invalid_request')
      const anchor = this.anchors.get(target.id)
      if (input.mode === 'reply' && (!anchor || anchor.expiresAt <= this.now()))
        throw new ManualError(409, 'reply_expired')
      for (const [id, preview] of this.previews) {
        if (preview.expiresAt <= this.now() || preview.target === target.id)
          this.previews.delete(id)
      }
      const preview: Preview = {
        id: randomUUID(),
        target: target.id,
        title: target.title,
        scope: target.scope,
        sessionId: target.sessionId,
        lease: lease.id,
        text: input.text,
        mode: input.mode,
        expiresAt: Math.min(lease.expiresAt, this.now() + 120_000),
        msgId: input.mode === 'reply' ? anchor!.id : undefined,
      }
      this.previews.set(preview.id, preview)
      const { lease: _lease, sessionId: _session, msgId: _message, ...publicPreview } = preview
      return publicPreview
    })
  }

  private async send(id: string): Promise<Delivery> {
    const admitted = await this.serial(async () => {
      const previous = this.state.deliveries[id]
      if (previous)
        return { previous }
      const preview = this.previews.get(id)
      if (!preview || preview.expiresAt <= this.now())
        throw new ManualError(409, 'preview_expired')
      const lease = this.lease(preview.target, preview.lease)
      if (lease.phase !== 'active')
        throw new ManualError(409, 'still_pausing')
      const target = await this.target(preview.target)
      if (target.sessionId !== preview.sessionId)
        throw new ManualError(409, 'stale_session')
      if (!await this.bridge.quota(target))
        throw new ManualError(429, 'rate_limited')
      this.lease(preview.target, preview.lease)
      if (preview.mode === 'reply') {
        const anchor = this.anchors.get(target.id)
        if (!anchor || anchor.id !== preview.msgId || anchor.expiresAt <= this.now())
          throw new ManualError(409, 'reply_expired')
        await this.bridge.reserveReply(target, preview.msgId!)
      }
      const receipt: Delivery = { id, target: target.id, textHash: hash(preview.text), mode: preview.mode, status: 'pending', createdAt: this.now() }
      this.state.deliveries[id] = receipt
      await this.save()
      this.previews.delete(id)
      return { target, preview, receipt }
    })
    if ('previous' in admitted)
      return admitted.previous!
    const { target, preview, receipt } = admitted
    try {
      const response = await this.bridge.send(target, preview.text, preview.mode, preview.msgId) as { id?: unknown }
      if (typeof response?.id === 'string' && response.id) {
        receipt.status = 'sent'
        receipt.messageId = response.id.slice(0, 512)
      }
      else {
        receipt.status = 'unknown'
        receipt.code = 'delivery_unknown'
      }
    }
    catch (error) {
      const failure = error as { bizCode?: unknown, httpStatus?: unknown }
      const code = typeof failure.bizCode === 'number' || (typeof failure.bizCode === 'string' && /^\d+$/.test(failure.bizCode)) ? String(failure.bizCode) : undefined
      const definitive = code !== undefined || (typeof failure.httpStatus === 'number' && failure.httpStatus >= 400 && failure.httpStatus < 500)
      receipt.status = definitive ? 'failed' : 'unknown'
      receipt.code = code ?? (definitive ? 'platform_rejected' : 'delivery_unknown')
    }
    await this.serial(async () => {
      await this.save()
    })
    return receipt
  }

  close() {
    this.closed = true
    this.online = false
  }
}
