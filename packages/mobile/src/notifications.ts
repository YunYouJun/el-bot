import type { PushReceipt, PushSender } from './apns'
import type { DeviceStore } from './auth'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { MobileError } from './http'

interface Registration { deviceId: string, token: string, environment: 'sandbox' | 'production' }
interface Receipt extends PushReceipt { key: string, deviceId: string, at: number }
interface State { version: 1, registrations: Registration[], receipts: Receipt[] }
export interface ReminderEvent { type: string, data: { source?: { kind?: string }, id?: string, message?: { content?: { type: string, text?: string }[] } } }
const DAY = 24 * 60 * 60_000

/** Only host schedule events can cause a push; chat text cannot impersonate their source. */
export class ReminderNotifications {
  private state: State = { version: 1, registrations: [], receipts: [] }
  private pending = new Map<string, { id: string, text: string, at: number }>()
  private transaction: Promise<unknown> = Promise.resolve()

  constructor(private readonly file: string, private readonly devices: Pick<DeviceStore, 'list'>, private readonly send?: PushSender, private readonly publicOrigin = '', private readonly now = Date.now) {}

  async load() {
    try {
      const bytes = await readFile(this.file, 'utf8')
      if (bytes.length > 1024 * 1024)
        throw new Error('Notification state exceeds its size limit')
      const data: State = JSON.parse(bytes)
      if (data.version !== 1 || !Array.isArray(data.registrations) || data.registrations.length > 20
        || data.registrations.some(row => !this.valid(row) || typeof row.deviceId !== 'string')
        || !Array.isArray(data.receipts) || data.receipts.length > 500
        || data.receipts.some(row => !row || typeof row.key !== 'string' || typeof row.deviceId !== 'string' || typeof row.id !== 'string'
          || !Number.isFinite(row.at) || !['accepted', 'rejected', 'unknown'].includes(row.status))) {
        throw new Error('Invalid notification state')
      }
      this.state = data
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
  }

  private valid(value: unknown): value is Omit<Registration, 'deviceId'> {
    if (!value || typeof value !== 'object')
      return false
    const row = value as Registration
    return typeof row.token === 'string' && /^[a-f0-9]{32,512}$/.test(row.token) && row.token.length % 2 === 0
      && (row.environment === 'sandbox' || row.environment === 'production')
  }

  private update<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.transaction.then(operation)
    this.transaction = task.catch(() => {})
    return task
  }

  private async commit(state: State) {
    const active = new Set(this.devices.list().map(row => row.id))
    const next: State = {
      version: 1,
      registrations: state.registrations.filter(row => active.has(row.deviceId)),
      receipts: state.receipts.filter(row => active.has(row.deviceId) && row.at >= this.now() - DAY).slice(-500),
    }
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 })
    const temporary = `${this.file}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(next)}\n`, { flag: 'wx', mode: 0o600 })
    await rename(temporary, this.file)
    this.state = next
  }

  status(deviceId: string) {
    const receipt = this.state.receipts.findLast(row => row.deviceId === deviceId)
    return {
      configured: Boolean(this.send),
      registered: this.state.registrations.some(row => row.deviceId === deviceId),
      ...(receipt ? { lastReceipt: { status: receipt.status, at: new Date(receipt.at).toISOString(), ...(receipt.code ? { code: receipt.code } : {}) } } : {}),
    }
  }

  register(deviceId: string, value: unknown) {
    return this.update(async () => {
      if (!this.send)
        throw new MobileError(503, 'notifications_not_configured')
      if (!this.devices.list().some(row => row.id === deviceId))
        throw new MobileError(401, 'unauthorized')
      if (!this.valid(value))
        throw new MobileError(400, 'invalid_push_registration')
      await this.commit({ ...this.state, registrations: [
        ...this.state.registrations.filter(row => row.deviceId !== deviceId && !(row.token === value.token && row.environment === value.environment)),
        { deviceId, token: value.token, environment: value.environment },
      ] })
      return this.status(deviceId)
    })
  }

  unregister(deviceId: string) {
    return this.update(async () => {
      await this.commit({ ...this.state, registrations: this.state.registrations.filter(row => row.deviceId !== deviceId) })
      return this.status(deviceId)
    })
  }

  event(sessionId: string, event: ReminderEvent) {
    return this.update(async () => {
      if (!this.send)
        return
      for (const [id, row] of this.pending) {
        if (row.at < this.now() - 30 * 60_000)
          this.pending.delete(id)
      }
      if (event.type === 'user/message' && event.data.source?.kind === 'schedule' && event.data.id) {
        if (this.pending.size >= 256)
          throw new Error('Too many active reminder turns')
        this.pending.set(sessionId, { id: event.data.id, text: '', at: this.now() })
      }
      const pending = this.pending.get(sessionId)
      if (!pending)
        return
      if (event.type === 'assistant/message') {
        const text = event.data.message?.content?.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n').trim()
        if (text)
          pending.text = text.slice(0, 400)
      }
      if (event.type !== 'turn/end')
        return
      this.pending.delete(sessionId)
      if (!pending.text)
        return
      for (const device of this.devices.list()) {
        const registration = this.state.registrations.find(row => row.deviceId === device.id)
        if (!registration)
          continue
        const key = createHash('sha256').update(`${sessionId}:${pending.id}:${device.id}`).digest('hex')
        if (this.state.receipts.some(row => row.key === key))
          continue
        const receipt: Receipt = { key, deviceId: device.id, status: 'unknown', id: randomUUID(), at: this.now() }
        // Claim before the side effect. A timeout or restart must not duplicate an alert.
        await this.commit({ ...this.state, receipts: [...this.state.receipts, receipt] })
        if (!this.devices.list().some(row => row.id === device.id))
          continue
        let result: PushReceipt
        try {
          result = await this.send({ ...registration, sessionId, origin: this.publicOrigin, title: '小云提醒', text: pending.text, id: receipt.id })
        }
        catch { result = { status: 'unknown', id: receipt.id, code: 'provider_error' } }
        const invalid = result.code === 'Unregistered' || result.code === 'BadDeviceToken' || result.code === 'DeviceTokenNotForTopic'
        await this.commit({ ...this.state, registrations: invalid ? this.state.registrations.filter(row => row !== registration) : this.state.registrations, receipts: this.state.receipts.map(row => row.key === key ? { ...receipt, ...result } : row) })
      }
    })
  }

  async close() { await this.transaction }
}
