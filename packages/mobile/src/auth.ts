import type { Device } from './types'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const PAIR_TTL = 5 * 60_000
const DEVICE_TTL = 30 * 24 * 60 * 60_000
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

interface StoredDevice extends Device { tokenHash: string }
interface State {
  version: 1
  devices: StoredDevice[]
  pairing?: { hash: string, expiresAt: number }
}

function digest(kind: string, value: string) {
  return createHash('sha256').update(`${kind}:${value}`).digest('hex')
}

/** One running host owns this file; the private admin socket serializes CLI changes. */
export class DeviceStore {
  private state: State = { version: 1, devices: [] }
  private transaction: Promise<unknown> = Promise.resolve()
  private attempts: number[] = []

  constructor(readonly path: string, private readonly now = Date.now) {}

  async load() {
    try {
      const bytes = await readFile(this.path, 'utf8')
      if (bytes.length > 64 * 1024)
        throw new Error('Mobile device state exceeds its size limit')
      const value: unknown = JSON.parse(bytes)
      if (!value || typeof value !== 'object')
        throw new Error('Invalid mobile device state')
      const state = value as State
      if (state.version !== 1 || !Array.isArray(state.devices) || state.devices.length > 20
        || state.devices.some(d => !d || !/^[a-f0-9]{64}$/.test(d.tokenHash) || typeof d.id !== 'string'
          || typeof d.name !== 'string' || typeof d.createdAt !== 'string' || typeof d.expiresAt !== 'string'
          || !Number.isFinite(Date.parse(d.createdAt)) || !Number.isFinite(Date.parse(d.expiresAt)))
        || (state.pairing && (!/^[a-f0-9]{64}$/.test(state.pairing.hash) || !Number.isFinite(state.pairing.expiresAt)))) {
        throw new Error('Invalid mobile device state')
      }
      this.state = state
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
  }

  private update<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.transaction.then(operation)
    this.transaction = task.catch(() => {})
    return task
  }

  private async commit(next: State) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600, flag: 'wx' })
    await rename(temporary, this.path)
    this.state = next
  }

  createPairing() {
    return this.update(async () => {
      const code = [...randomBytes(8)].map(byte => CODE_ALPHABET[byte & 31]).join('')
      const expiresAt = this.now() + PAIR_TTL
      await this.commit({ ...this.state, pairing: { hash: digest('pair', code), expiresAt } })
      return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresAt: new Date(expiresAt).toISOString() }
    })
  }

  exchange(input: string, deviceName: string) {
    const now = this.now()
    this.attempts = this.attempts.filter(at => now - at < 60_000)
    if (this.attempts.length >= 20)
      return Promise.reject(new Error('pairing_rate_limited'))
    this.attempts.push(now)
    return this.update(async () => {
      const code = input.normalize('NFKC').replace(/[\s\p{Dash_Punctuation}\u2212]/gu, '').toUpperCase()
      const pairing = this.state.pairing
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code) || !pairing || pairing.expiresAt <= this.now() || pairing.hash !== digest('pair', code))
        throw new Error('invalid_pairing')
      const devices = this.state.devices.filter(device => Date.parse(device.expiresAt) > this.now())
      if (devices.length >= 20)
        throw new Error('device_limit')
      const token = randomBytes(32).toString('base64url')
      const device: Device = {
        id: randomUUID(),
        name: deviceName.trim().slice(0, 64) || 'iPhone',
        createdAt: new Date(this.now()).toISOString(),
        expiresAt: new Date(this.now() + DEVICE_TTL).toISOString(),
      }
      await this.commit({ version: 1, devices: [...devices, { ...device, tokenHash: digest('token', token) }] })
      return { token, device }
    })
  }

  authorize(header: string | undefined): Device | undefined {
    if (!header || !/^Bearer [\w-]{43}$/.test(header))
      return undefined
    const hash = digest('token', header.slice(7))
    const device = this.state.devices.find(d => d.tokenHash === hash && Date.parse(d.expiresAt) > this.now())
    if (!device)
      return undefined
    const { tokenHash: _hash, ...publicDevice } = device
    return publicDevice
  }

  list(): Device[] {
    return this.state.devices.filter(d => Date.parse(d.expiresAt) > this.now()).map(({ tokenHash: _hash, ...device }) => device)
  }

  revoke(id: string) {
    return this.update(async () => {
      await this.commit({ ...this.state, devices: this.state.devices.filter(device => device.id !== id) })
    })
  }
}
