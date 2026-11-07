import type { Fetch } from './protocol'
import type { AccountStore, Receipt } from './store'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { AUTH_ENDPOINT, CLIENT_ID, entitlementIdentity, hash, jsonRequest, object, publicKey, runtimeEndpoint, SCOPE, YunlefunError } from './protocol'

export interface Model {
  modelId: string
  displayName: string
  policyVersion: string
  maxOutputTokens: number
  maxInputBytes: number
  tools: boolean
  pricing: Record<string, unknown>
}
export interface AgentInput {
  messages: Record<string, unknown>[]
  tools: Record<string, unknown>[]
  maxOutputTokens: number
  temperatureMilli: number
}
export interface Catalog {
  models: Model[]
  account: Record<string, unknown>
}
type Verify = typeof entitlementIdentity
const FINAL = new Set(['settled', 'released'])
function isFinal(receipt: { status?: string, billingStatus?: string }) {
  return FINAL.has(receipt.billingStatus ?? '') || (receipt.billingStatus === 'none' && ['failed', 'blocked', 'cancelled', 'rejected'].includes(receipt.status ?? ''))
}
export class YunlefunService {
  private readonly endpoint: string
  private authOperation?: Promise<unknown>
  private refreshing?: Promise<void>
  private readonly calls = new Map<string, Promise<Record<string, unknown>>>()
  private readonly now: () => number
  constructor(readonly store: AccountStore, origin: string, private readonly options: {
    fetch?: Fetch
    verify?: Verify
    now?: () => number
    sleep?: (signal?: AbortSignal) => Promise<void>
  } = {}) {
    this.endpoint = runtimeEndpoint(origin)
    this.now = options.now ?? Date.now
  }

  private authRequest(input: unknown, signal?: AbortSignal) {
    return jsonRequest(AUTH_ENDPOINT, input, this.store.snapshot.key, { fetch: this.options.fetch, signal })
  }

  private async install(result: Record<string, unknown>) {
    if (typeof result.entitlement !== 'string' || typeof result.deviceRefreshToken !== 'string' || !result.deviceRefreshToken || result.deviceRefreshToken.length > 4096)
      throw new YunlefunError('INVALID_ENTITLEMENT', 401)
    const identity = (this.options.verify ?? entitlementIdentity)(result.entitlement, this.store.snapshot.key, this.now())
    const prior = this.store.snapshot.authorization
    if (prior && prior.uid !== identity.uid)
      throw new YunlefunError('ACCOUNT_MISMATCH', 409)
    await this.store.change((state) => {
      state.authorization = { ...identity, entitlement: result.entitlement as string, refreshToken: result.deviceRefreshToken as string }
      delete state.pending
      delete state.refreshPending
      delete state.needsAuthorization
    })
  }

  async start(consent: unknown) {
    if (consent !== true)
      throw new YunlefunError('CONSENT_REQUIRED')
    if (this.authOperation || (this.store.snapshot.authorization && !this.store.snapshot.refreshPending && !this.store.snapshot.needsAuthorization))
      throw new YunlefunError('AUTH_ALREADY_ACTIVE', 409)
    const operation = (async () => {
      const result = await this.authRequest({ action: 'startDeviceAuth', clientId: CLIENT_ID, scope: ['membership:read', SCOPE], deviceName: '小云云端 AI', devicePublicJwk: publicKey(this.store.snapshot.key) })
      const uri = new URL(String(result.verificationUriComplete))
      if (uri.origin !== 'https://www.yunle.fun' || uri.pathname !== '/link' || uri.username || uri.password || uri.hash || typeof result.deviceCode !== 'string' || result.deviceCode.length > 256 || typeof result.userCode !== 'string' || result.userCode.length > 32 || !Number.isSafeInteger(result.expiresIn) || Number(result.expiresIn) < 1 || Number(result.expiresIn) > 1800 || !Number.isSafeInteger(result.interval) || Number(result.interval) < 1 || Number(result.interval) > 60)
        throw new YunlefunError('INVALID_RESPONSE', 503)
      await this.store.change((state) => {
        state.pending = { deviceCode: result.deviceCode as string, userCode: result.userCode as string, verificationUri: uri.href, expiresAt: this.now() + Number(result.expiresIn) * 1000, interval: Number(result.interval) * 1000, nextPollAt: this.now() + Number(result.interval) * 1000 }
      })
    })()
    this.authOperation = operation
    try {
      await operation
    }
    finally {
      this.authOperation = undefined
    }
    return this.status()
  }

  async poll() {
    if (this.authOperation)
      throw new YunlefunError('AUTH_BUSY', 409)
    const pending = this.store.snapshot.pending
    if (!pending)
      return this.status()
    if (pending.expiresAt <= this.now()) {
      await this.store.change(state => delete state.pending)
      throw new YunlefunError('AUTH_EXPIRED', 401)
    }
    if (pending.nextPollAt > this.now())
      return this.status()
    const operation = (async () => {
      await this.store.change(state => state.pending && (state.pending.nextPollAt = this.now() + pending.interval))
      const result = await this.authRequest({ action: 'pollDeviceToken', deviceCode: pending.deviceCode })
      if (result.status === 'approved') {
        await this.install(result)
      }
      else if (result.status === 'slow_down') {
        await this.store.change((state) => {
          if (state.pending) {
            state.pending.interval = Math.min(state.pending.interval + 5000, 60000)
            state.pending.nextPollAt = this.now() + state.pending.interval
          }
        })
      }
      else if (result.status !== 'pending' && result.status !== 'authorization_pending') {
        await this.store.change(state => delete state.pending)
        throw new YunlefunError('AUTH_DENIED', 401)
      }
    })()
    this.authOperation = operation
    try {
      await operation
    }
    finally {
      this.authOperation = undefined
    }
    return this.status()
  }

  async status() {
    const state = this.store.snapshot
    return { authorized: !!state.authorization, reauthorize: !!state.refreshPending || !!state.needsAuthorization, userId: state.authorization?.uid, expiresAt: state.authorization?.expiresAt, pending: state.pending ? { userCode: state.pending.userCode, verificationUri: state.pending.verificationUri, expiresAt: state.pending.expiresAt, interval: state.pending.interval } : undefined, tasks: state.receipts.filter(row => !isFinal(row)).map(({ requestId, taskId, status, billingStatus }) => ({ requestId, taskId, status, billingStatus })) }
  }

  private async ready() {
    const auth = this.store.snapshot.authorization
    if (!auth)
      throw new YunlefunError('AUTH_REQUIRED', 401)
    if (this.refreshing)
      return this.refreshing
    if (this.store.snapshot.refreshPending)
      throw new YunlefunError('AUTH_REFRESH_UNCERTAIN', 401)
    if (this.store.snapshot.needsAuthorization)
      throw new YunlefunError('AUTH_REQUIRED', 401)
    if (auth.expiresAt - this.now() > 60000)
      return
    this.refreshing ??= (async () => {
      // A rotating refresh token must never be replayed after a lost response or restart.
      await this.store.change(state => state.refreshPending = true)
      const result = await this.authRequest({ action: 'refreshEntitlement', deviceRefreshToken: auth.refreshToken })
      await this.install(result)
    })().finally(() => {
      this.refreshing = undefined
    })
    await this.refreshing
  }

  async request(input: unknown, signal?: AbortSignal) {
    await this.ready()
    const state = this.store.snapshot
    try {
      return await jsonRequest(this.endpoint, input, state.key, { entitlement: state.authorization!.entitlement, fetch: this.options.fetch, signal })
    }
    catch (error) {
      if (error instanceof YunlefunError && error.status === 401)
        await this.store.change(state => state.needsAuthorization = true)
      throw error
    }
  }

  async catalog(signal?: AbortSignal): Promise<Catalog> {
    const result = await this.request({ action: 'catalog' }, signal)
    if (!Array.isArray(result.models) || result.applicationId !== 'el-bot')
      throw new YunlefunError('INVALID_RESPONSE', 503)
    const models = result.models.map((item): Model => {
      const value = object(item)
      if (typeof value.modelId !== 'string' || !/^[\w.-]{1,128}$/.test(value.modelId) || typeof value.displayName !== 'string' || value.displayName.length > 256 || typeof value.policyVersion !== 'string' || !value.policyVersion || value.policyVersion.length > 512 || !Number.isSafeInteger(value.maxOutputTokens) || Number(value.maxOutputTokens) < 1 || Number(value.maxOutputTokens) > 8192 || !Number.isSafeInteger(value.maxInputBytes) || Number(value.maxInputBytes) < 1 || Number(value.maxInputBytes) > 96 * 1024 || value.tools !== true)
        throw new YunlefunError('INVALID_RESPONSE', 503)
      return { modelId: value.modelId, displayName: value.displayName, policyVersion: value.policyVersion, maxOutputTokens: Number(value.maxOutputTokens), maxInputBytes: Number(value.maxInputBytes), tools: true, pricing: object(value.pricing) }
    })
    return { models, account: object(result.account) }
  }

  async generate(model: Model, input: AgentInput, fingerprint: string, signal?: AbortSignal) {
    await this.ready()
    const uid = this.store.snapshot.authorization!.uid
    const key = hash(`${uid}:${fingerprint}`)
    const existing = this.calls.get(key)
    if (existing)
      return existing
    const operation = this.run(model, input, key, uid, signal).finally(() => {
      this.calls.delete(key)
    })
    this.calls.set(key, operation)
    return operation
  }

  private async run(model: Model, input: AgentInput, fingerprint: string, uid: string, signal?: AbortSignal) {
    if (signal?.aborted)
      throw new YunlefunError('CANCELLED')
    if (Buffer.byteLength(JSON.stringify(input)) > model.maxInputBytes)
      throw new YunlefunError('INPUT_TOO_LARGE')
    let receipt = this.store.snapshot.receipts.find(row => row.fingerprint === fingerprint && row.uid === uid && row.status !== 'rejected')
    if (!receipt) {
      if (this.store.snapshot.receipts.some(row => row.uid === uid && !row.taskId && !isFinal(row)))
        throw new YunlefunError('TASK_PENDING', 409)
      receipt = { uid, fingerprint, requestId: randomUUID(), modelId: model.modelId, policyVersion: model.policyVersion, input, updatedAt: this.now() }
      const fresh = receipt
      await this.store.change((state) => {
        // Keep unfinished receipts indefinitely; completed receipts are bounded.
        const complete = state.receipts.filter(row => isFinal(row)).slice(-499)
        state.receipts = [...state.receipts.filter(row => !isFinal(row)), ...complete, fresh]
      })
    }
    if (!receipt.taskId) {
      let accepted: Record<string, unknown>
      try {
        accepted = await this.request({ action: 'submit', requestId: receipt.requestId, modelId: receipt.modelId, policyVersion: receipt.policyVersion, input }, signal)
      }
      catch (error) {
        // Price/model rejection precedes admission; an explicit insufficient-balance
        // response confirms that the atomic reservation did not fund the task.
        if (error instanceof YunlefunError && ['CATALOG_STALE', 'MODEL_DISABLED', 'INVALID_REQUEST', 'INVALID_RESERVATION', 'AI_POINTS_INSUFFICIENT'].includes(error.code)) {
          const rejected = { ...receipt, status: 'rejected', billingStatus: error.code === 'AI_POINTS_INSUFFICIENT' ? 'none' : 'released' }
          delete rejected.input
          await this.save(rejected)
        }
        throw error
      }
      if (typeof accepted.taskId !== 'string' || !/^[\w.:-]{1,128}$/.test(accepted.taskId))
        throw new YunlefunError('INVALID_RESPONSE', 503)
      receipt = { ...receipt, taskId: accepted.taskId }
      delete receipt.input
      await this.save(receipt)
    }
    const deadline = this.now() + 120000
    for (;;) {
      if (signal?.aborted)
        throw new YunlefunError('TASK_PENDING', 409)
      const snapshot = await this.recover(receipt.requestId, false, signal)
      if (snapshot.status === 'completed' && snapshot.billingStatus === 'settled')
        return snapshot
      if (snapshot.status === 'failed' || snapshot.status === 'cancelled' || snapshot.status === 'blocked' || snapshot.billingStatus === 'reconcile_required') {
        const error = snapshot.error && typeof snapshot.error === 'object' ? object(snapshot.error) : undefined
        const code = typeof error?.code === 'string' && /^[\w-]{1,80}$/.test(error.code) ? error.code : 'TASK_FAILED'
        throw new YunlefunError(snapshot.billingStatus === 'reconcile_required' ? 'BILLING_PENDING' : code, code === 'AI_POINTS_INSUFFICIENT' ? 402 : 409)
      }
      if (this.now() >= deadline)
        throw new YunlefunError('TASK_PENDING', 409)
      await (this.options.sleep
        ? this.options.sleep(signal)
        : new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', stop)
              resolve()
            }, 1000)
            function stop() {
              clearTimeout(timer)
              resolve()
            }
            signal?.addEventListener('abort', stop, { once: true })
          }))
    }
  }

  private save(receipt: Receipt) {
    return this.store.change((state) => {
      const index = state.receipts.findIndex(row => row.requestId === receipt.requestId && row.uid === receipt.uid)
      if (index < 0)
        throw new YunlefunError('RECEIPT_NOT_FOUND')
      state.receipts[index] = { ...receipt, updatedAt: this.now() }
    })
  }

  async recover(requestId: string, cancel = false, signal?: AbortSignal) {
    let receipt = this.store.snapshot.receipts.find(row => row.requestId === requestId && row.uid === this.store.snapshot.authorization?.uid)
    if (!receipt)
      throw new YunlefunError('RECEIPT_NOT_FOUND', 404)
    if (!receipt.taskId) {
      let accepted: Record<string, unknown>
      try {
        accepted = await this.request({ action: 'lookup', requestId: receipt.requestId }, signal)
      }
      catch (error) {
        if (!(error instanceof YunlefunError) || error.code !== 'TASK_NOT_FOUND')
          throw error
        // Cancellation never submits work whose admission is still unknown.
        if (cancel || !receipt.input)
          throw new YunlefunError('TASK_PENDING', 409)
        accepted = await this.request({ action: 'submit', requestId: receipt.requestId, modelId: receipt.modelId, policyVersion: receipt.policyVersion, input: receipt.input }, signal)
      }
      if (typeof accepted.taskId !== 'string' || !/^[\w.:-]{1,128}$/.test(accepted.taskId))
        throw new YunlefunError('INVALID_RESPONSE', 503)
      receipt = { ...receipt, taskId: accepted.taskId }
      delete receipt.input
      await this.save(receipt)
    }
    const result = await this.request({ action: cancel ? 'cancel' : 'snapshot', taskId: receipt.taskId, ...(cancel ? { requestId: `cancel-${receipt.requestId}` } : {}) }, signal)
    if (result.taskId !== receipt.taskId || typeof result.status !== 'string' || typeof result.billingStatus !== 'string')
      throw new YunlefunError('INVALID_RESPONSE', 503)
    await this.save({ ...receipt, status: result.status, billingStatus: result.billingStatus })
    return result
  }

  async disconnect() {
    if (this.calls.size || this.refreshing || this.authOperation || this.store.snapshot.receipts.some(row => !isFinal(row)))
      throw new YunlefunError('TASK_PENDING', 409)
    await this.store.change((state) => {
      delete state.authorization
      delete state.pending
      delete state.refreshPending
      delete state.needsAuthorization
    })
    return this.status()
  }
}
