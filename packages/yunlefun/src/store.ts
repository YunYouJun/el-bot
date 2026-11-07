import type { JsonWebKey } from './protocol'
import type { AgentInput } from './service'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { installationKey, object, publicKey, YunlefunError } from './protocol'

export interface Authorization {
  uid: string
  entitlement: string
  expiresAt: number
  refreshToken: string
}
export interface PendingAuthorization {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresAt: number
  interval: number
  nextPollAt: number
}
export interface Receipt {
  uid: string
  fingerprint: string
  requestId: string
  modelId: string
  policyVersion: string
  input?: AgentInput
  taskId?: string
  status?: string
  billingStatus?: string
  updatedAt: number
}
export interface State {
  version: 1
  key: JsonWebKey
  authorization?: Authorization
  pending?: PendingAuthorization
  refreshPending?: boolean
  needsAuthorization?: boolean
  receipts: Receipt[]
}
/** Credentials and receipts are server-only; writes are serialized and atomic. */
export class AccountStore {
  private state?: State
  private chain: Promise<unknown> = Promise.resolve()
  constructor(private readonly path: string) {
  }

  async load() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    await chmod(dirname(this.path), 0o700)
    try {
      const state = object(JSON.parse(await readFile(this.path, 'utf8')))
      if (state.version !== 1 || !Array.isArray(state.receipts))
        throw new YunlefunError('INVALID_ACCOUNT_STORE')
      publicKey(object(state.key))
      this.state = state as unknown as State
      await chmod(this.path, 0o600)
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
        throw error
      this.state = { version: 1, key: installationKey(), receipts: [] }
      await this.change(() => {
      })
    }
  }

  get snapshot(): State {
    if (!this.state)
      throw new YunlefunError('ACCOUNT_NOT_READY', 503)
    return structuredClone(this.state)
  }

  async change<T>(mutate: (state: State) => T): Promise<T> {
    const operation = this.chain.then(async () => {
      const state = this.snapshot
      const result = mutate(state)
      const temporary = `${this.path}.${randomUUID()}.tmp`
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
      await rename(temporary, this.path)
      this.state = state
      return result
    })
    this.chain = operation.catch(() => undefined)
    return operation
  }
}
