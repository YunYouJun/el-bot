import type { DeviceStore } from './auth'
import type { MobileHost } from './types'
import { Buffer } from 'node:buffer'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { MobileError } from './http'

export const PHONE_APPS = ['chrome', 'safari', 'settings'] as const
export type PhoneApp = typeof PHONE_APPS[number]
interface Lease { deviceId: string, channel: string, sessionId: string, apps: PhoneApp[], expiresAt: number, seen: number }
interface Receipt { status: 'succeeded' | 'failed' | 'unknown', launched: boolean, returnedToYun: boolean }
interface Command {
  id: string
  sessionId: string
  app: PhoneApp
  returnToYun: boolean
  expiresAt: number
  claimed: boolean
  receipt?: Receipt
  settle: (value: Receipt) => void
}
export interface PhoneTools {
  register: (definition: {
    name: string
    description: string
    parameters: Record<string, unknown>
    output: { schema: Record<string, unknown>, render: (args: unknown, value: unknown) => { type: 'text', text: string }[] }
    execute: (args: unknown, execution: { agent?: { session?: { id?: string } }, callId: string, signal: AbortSignal }) => Promise<unknown>
  }) => () => void
}

/** Session-bound, locally armed, at-most-once dispatch. No iCTRL key leaves the phone. */
export class PhoneRelay {
  private leases = new Map<string, Lease>()
  private commands = new Map<string, Command>()
  private admissions = new Map<string, Promise<unknown>>()
  private timer: ReturnType<typeof setInterval>

  constructor(private devices: DeviceStore, private host: Pick<MobileHost, 'create'>, private now = Date.now) {
    this.timer = setInterval(() => this.prune(), 1000)
    this.timer.unref()
  }

  private active(lease: Lease) {
    return lease.expiresAt > this.now() && this.devices.list().some(device => device.id === lease.deviceId)
  }

  private prune() {
    for (const [id, lease] of this.leases) {
      if (!this.active(lease)) {
        this.leases.delete(id)
        this.cancelSession(lease.sessionId)
      }
    }
    for (const command of this.commands.values()) {
      if (!command.receipt && command.expiresAt <= this.now())
        this.finish(command, { status: command.claimed ? 'unknown' : 'failed', launched: false, returnedToYun: false })
      if (command.receipt && command.expiresAt + 600_000 < this.now())
        this.commands.delete(command.id)
    }
  }

  private cancelSession(sessionId: string) {
    for (const command of this.commands.values()) {
      if (command.sessionId === sessionId && !command.receipt)
        this.finish(command, { status: command.claimed ? 'unknown' : 'failed', launched: false, returnedToYun: false })
    }
  }

  async open(deviceId: string, requestId: string, apps: unknown) {
    this.prune()
    if (!Array.isArray(apps) || apps.length < 1 || apps.length > 3 || new Set(apps).size !== apps.length
      || apps.some(app => !PHONE_APPS.includes(app))) {
      throw new MobileError(400, 'invalid_phone_apps')
    }
    if (!/^[\w-]{1,128}$/.test(requestId))
      throw new MobileError(400, 'invalid_request_id')
    // A lost registration response never allocates a second session or extends the lease.
    const key = `${deviceId}:${requestId}`
    const previous = this.admissions.get(key)
    if (previous)
      return previous
    const operation = (async () => {
      const sessionId = await this.host.create(`phone-${deviceId}-${requestId}`)
      const device = this.devices.list().find(device => device.id === deviceId)
      if (!device)
        throw new MobileError(401, 'unauthorized')
      this.stop(deviceId)
      const lease: Lease = { deviceId, channel: randomBytes(32).toString('base64url'), sessionId, apps, expiresAt: Math.min(this.now() + 600_000, Date.parse(device.expiresAt)), seen: this.now() }
      this.leases.set(deviceId, lease)
      return { channel: lease.channel, sessionId, apps, expiresAt: new Date(lease.expiresAt).toISOString() }
    })()
    this.admissions.set(key, operation)
    if (this.admissions.size > 100)
      this.admissions.delete(this.admissions.keys().next().value!)
    return operation
  }

  private lease(deviceId: string, channel: string | undefined) {
    this.prune()
    const lease = this.leases.get(deviceId)
    if (!lease || !channel || !/^[\w-]{43}$/.test(channel)
      || !timingSafeEqual(Buffer.from(channel), Buffer.from(lease.channel))) {
      throw new MobileError(403, 'phone_channel_inactive')
    }
    return lease
  }

  next(deviceId: string, channel: string | undefined) {
    const lease = this.lease(deviceId, channel)
    lease.seen = this.now()
    const command = [...this.commands.values()].find(command => command.sessionId === lease.sessionId && !command.claimed && !command.receipt)
    if (!command)
      return { command: null }
    // Delivery is a claim, never a visibility timeout / redelivery queue.
    command.claimed = true
    return { command: { id: command.id, sessionId: command.sessionId, app: command.app, returnToYun: command.returnToYun, expiresAt: new Date(command.expiresAt).toISOString() } }
  }

  complete(deviceId: string, channel: string | undefined, value: Record<string, unknown>) {
    const lease = this.lease(deviceId, channel)
    const command = typeof value.id === 'string' ? this.commands.get(value.id) : undefined
    if (!command || command.sessionId !== lease.sessionId || !command.claimed)
      throw new MobileError(404, 'phone_command_not_found')
    if (!['succeeded', 'failed', 'unknown'].includes(value.status as string) || typeof value.launched !== 'boolean' || typeof value.returnedToYun !== 'boolean'
      || (value.status === 'succeeded' && (!value.launched || (command.returnToYun && !value.returnedToYun)))) {
      throw new MobileError(400, 'invalid_phone_receipt')
    }
    const receipt = { status: value.status, launched: value.launched, returnedToYun: value.returnedToYun } as Receipt
    if (command.receipt && JSON.stringify(command.receipt) !== JSON.stringify(receipt))
      throw new MobileError(409, 'phone_result_settled')
    this.finish(command, receipt)
    return { ok: true }
  }

  stop(deviceId: string, channel?: string) {
    const lease = channel ? this.lease(deviceId, channel) : this.leases.get(deviceId)
    if (lease) {
      this.leases.delete(deviceId)
      this.cancelSession(lease.sessionId)
    }
  }

  private finish(command: Command, receipt: Receipt) {
    if (command.receipt)
      return
    command.receipt = receipt
    command.settle(receipt)
  }

  async execute(sessionId: string | undefined, callId: string, args: unknown, signal: AbortSignal) {
    this.prune()
    const lease = [...this.leases.values()].find(lease => lease.sessionId === sessionId)
    if (!lease || this.now() - lease.seen > 10_000)
      throw new Error('Phone is not locally armed for this session, or is offline. Open Yun and enable phone control.')
    const value = args as { app?: unknown, return_to_yun?: unknown } | null
    if (!value || typeof value !== 'object' || !lease.apps.includes(value.app as PhoneApp)
      || (value.return_to_yun !== undefined && typeof value.return_to_yun !== 'boolean')
      || Object.keys(value).some(key => !['app', 'return_to_yun'].includes(key))) {
      throw new Error('Phone app is not locally allowed')
    }
    // Tool retries use the original call identity and cannot dispatch twice.
    const id = `${sessionId}:${callId}`
    const prior = this.commands.get(id)
    if (prior) {
      if (prior.receipt)
        return { ...prior.receipt, app: prior.app }
      throw new Error('Phone command is already pending; do not retry')
    }
    if (signal.aborted)
      throw signal.reason
    if ([...this.commands.values()].some(command => command.sessionId === sessionId && !command.receipt) || this.commands.size >= 100)
      throw new Error('Phone command queue is busy')
    let command!: Command
    const outcome = new Promise<Receipt>((settle) => {
      command = { id, sessionId: lease.sessionId, app: value.app as PhoneApp, returnToYun: value.return_to_yun !== false, expiresAt: Math.min(this.now() + 20_000, lease.expiresAt), claimed: false, settle }
    })
    this.commands.set(id, command)
    const cancel = () => this.finish(command, { status: command.claimed ? 'unknown' : 'failed', launched: false, returnedToYun: false })
    signal.addEventListener('abort', cancel, { once: true })
    try {
      return { ...await outcome, app: command.app }
    }
    finally { signal.removeEventListener('abort', cancel) }
  }

  register(tools: PhoneTools) {
    return tools.register({
      name: 'phone_open_app',
      description: 'Open an app on the locally armed iPhone for THIS session only. Apps: chrome, safari, settings. By default return to Yun after a brief view so the conversation can continue; set return_to_yun=false to stay in the opened app. Requires Yun foreground and a live local phone-control lease. Never claim success without a succeeded receipt. Failed/unknown actions must not be automatically retried.',
      parameters: { type: 'object', properties: { app: { type: 'string', enum: [...PHONE_APPS] }, return_to_yun: { type: 'boolean' } }, required: ['app'], additionalProperties: false },
      output: { schema: { type: 'object', properties: { status: { type: 'string' }, launched: { type: 'boolean' }, returnedToYun: { type: 'boolean' }, app: { type: 'string' } }, required: ['status', 'launched', 'returnedToYun', 'app'], additionalProperties: false }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: (args, execution) => this.execute(execution.agent?.session?.id, execution.callId, args, execution.signal),
    })
  }

  close() {
    clearInterval(this.timer)
    for (const lease of this.leases.values())
      this.cancelSession(lease.sessionId)
    this.leases.clear()
    this.admissions.clear()
  }
}
