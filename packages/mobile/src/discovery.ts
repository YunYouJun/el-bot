import type { AccountSyncConfig, VerifiedAccountIdentity, VerifyIdentityProof } from './account'
import type { Device } from './types'
import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export interface AccountInstance {
  id: string
  name: string
  publicOrigin: string
  state: 'online'
  lastSeen: string
  capabilities: string[]
  entitlement: 'owner'
}

export interface AccountDiscoveryConfig extends AccountSyncConfig {
  directory?: AccountInstanceDirectory
  enrollmentSecret?: string
  tickets?: AccountEnrollmentTicketIssuer
}

export interface AccountEnrollmentTicketIssuer {
  issue: (proof: { accessToken: string, identityAssertion: string, nonce: string }, instances: AccountInstance[], deviceName: string) => Promise<Record<string, string>>
  sign: (userId: string, instance: AccountInstance, deviceName: string, clientId?: string) => Promise<string>
}

export interface AccountInstanceDirectory {
  list: (userId: string) => Promise<AccountInstance[]>
}

export interface AccountEnrollmentTicket {
  ticket: string
  expiresAt: string
}

export interface AccountEnrollmentResult extends AccountEnrollmentTicket {
  instance: AccountInstance
  deviceName: string
}

const ENROLLMENT_TTL = 60_000
const CAPABILITIES = ['sessions', 'status']
const ENROLLMENT_SECRET_MIN_LENGTH = 32

export function isAccountInstance(value: unknown): value is AccountInstance {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const instance = value as Record<string, unknown>
  return typeof instance.id === 'string' && /^[\w-]{1,128}$/.test(instance.id)
    && typeof instance.name === 'string' && instance.name.length > 0 && instance.name.length <= 128
    && typeof instance.publicOrigin === 'string' && isHttpsOrigin(instance.publicOrigin)
    && instance.state === 'online'
    && typeof instance.lastSeen === 'string' && Number.isFinite(Date.parse(instance.lastSeen))
    && Array.isArray(instance.capabilities) && instance.capabilities.length <= 8
    && instance.capabilities.every(item => typeof item === 'string' && /^[\w-]{1,32}$/.test(item))
    && instance.entitlement === 'owner'
}

export function sanitizeInstances(value: unknown, now: () => number = Date.now): AccountInstance[] {
  if (!Array.isArray(value))
    throw new Error('invalid_instance_directory')
  return value.filter(isAccountInstance).slice(0, 20).map(instance => ({
    ...instance,
    publicOrigin: new URL(instance.publicOrigin).origin,
    lastSeen: new Date(Math.min(Date.parse(instance.lastSeen), now())).toISOString(),
    capabilities: [...new Set(instance.capabilities)].filter(item => CAPABILITIES.includes(item)),
  }))
}

export async function discoverInstances(
  proof: { accessToken: string, identityAssertion: string, nonce: string },
  config: AccountDiscoveryConfig | undefined,
  verify: VerifyIdentityProof,
  now: () => number = Date.now,
): Promise<{ userId: string, instances: AccountInstance[] }> {
  if (!config?.directory)
    throw new Error('account_not_configured')
  const identity = await verify(proof, config)
  const userId = validUserId(identity)
  const instances = sanitizeInstances(await config.directory.list(userId), now)
    .filter(instance => now() - Date.parse(instance.lastSeen) <= 120_000)
  return { userId, instances }
}

export async function enrollInstance(
  ticket: unknown,
  instanceId: string,
  deviceName: string,
  config: AccountDiscoveryConfig | undefined,
  verify: VerifyIdentityProof,
  proof: { accessToken: string, identityAssertion: string, nonce: string },
  redeem: (ticket: unknown, instanceId: string, deviceName: string) => Promise<unknown>,
  now: () => number = Date.now,
) {
  const discovery = await discoverInstances(proof, config, verify, now)
  const instance = discovery.instances.find(item => item.id === instanceId)
  if (!instance)
    throw new Error('instance_not_found')
  const claims = verifyEnrollmentTicket(ticket, instanceId, config, now)
  if (claims.userId !== discovery.userId || claims.deviceName !== deviceName.trim())
    throw new Error('invalid_enrollment')
  return redeem(ticket, instanceId, deviceName)
}

export function issueEnrollmentTicket(
  userId: string,
  instance: AccountInstance,
  deviceName: string,
  config: AccountDiscoveryConfig | undefined,
  now: () => number = Date.now,
): AccountEnrollmentResult {
  return signEnrollmentTicket(userId, instance, deviceName, config, randomBytes(16).toString('base64url'), now)
}

export function signEnrollmentTicket(
  userId: string,
  instance: AccountInstance,
  deviceName: string,
  config: AccountDiscoveryConfig | undefined,
  clientId: string = randomBytes(16).toString('base64url'),
  now: () => number = Date.now,
): AccountEnrollmentResult {
  const secret = config?.enrollmentSecret
  if (!secret || secret.length < ENROLLMENT_SECRET_MIN_LENGTH)
    throw new Error('account_not_configured')
  if (!/^[\w-]{16,128}$/.test(clientId))
    throw new Error('invalid_enrollment')
  validUserId({ userId })
  if (!isAccountInstance(instance) || !safeDeviceName(deviceName))
    throw new Error('invalid_enrollment')
  const expiresAt = now() + ENROLLMENT_TTL
  const payload = base64url(JSON.stringify({
    version: 1,
    userId,
    instanceId: instance.id,
    publicOrigin: instance.publicOrigin,
    deviceName: deviceName.trim().slice(0, 64),
    clientId,
    expiresAt,
  }))
  return {
    ticket: `${payload}.${base64url(createHmac('sha256', secret).update(payload).digest())}`,
    expiresAt: new Date(expiresAt).toISOString(),
    instance,
    deviceName: deviceName.trim().slice(0, 64),
  }
}

export function verifyEnrollmentTicket(
  ticket: unknown,
  instanceId: string,
  config: AccountDiscoveryConfig | undefined,
  now: () => number = Date.now,
) {
  const secret = config?.enrollmentSecret
  if (!secret || secret.length < ENROLLMENT_SECRET_MIN_LENGTH || typeof ticket !== 'string' || ticket.length > 4096 || !/^[\w-]+\.[\w-]+$/.test(ticket))
    throw new Error('invalid_enrollment')
  const [payload, signature] = ticket.split('.')
  const expected = base64url(createHmac('sha256', secret).update(payload).digest())
  const provided = Buffer.from(signature)
  if (provided.length !== Buffer.from(expected).length || !timingSafeEqual(provided, Buffer.from(expected)))
    throw new Error('invalid_enrollment')
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  }
  catch {
    throw new Error('invalid_enrollment')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_enrollment')
  const claims = value as Record<string, unknown>
  if (claims.version !== 1 || typeof claims.userId !== 'string' || !claims.userId
    || claims.instanceId !== instanceId || typeof claims.publicOrigin !== 'string' || !isHttpsOrigin(claims.publicOrigin)
    || typeof claims.deviceName !== 'string' || typeof claims.clientId !== 'string'
    || typeof claims.expiresAt !== 'number' || claims.expiresAt <= now() || claims.expiresAt > now() + ENROLLMENT_TTL + 1000) {
    throw new Error('invalid_enrollment')
  }
  return {
    userId: claims.userId as string,
    instanceId: claims.instanceId as string,
    publicOrigin: claims.publicOrigin as string,
    deviceName: claims.deviceName as string,
    clientId: claims.clientId as string,
    expiresAt: claims.expiresAt as number,
  }
}

export function redeemEnrollmentTicket(
  ticket: unknown,
  instanceId: string,
  config: AccountDiscoveryConfig | undefined,
  used: { has: (clientId: string) => boolean, add: (clientId: string, expiresAt: number) => Promise<void> },
  exchange: (deviceName: string) => Promise<{ token: string, device: Device }>,
  now: () => number = Date.now,
) {
  const claims = verifyEnrollmentTicket(ticket, instanceId, config, now)
  if (used.has(claims.clientId))
    throw new Error('invalid_enrollment')
  return used.add(claims.clientId, claims.expiresAt).then(() => exchange(claims.deviceName))
}

function validUserId(identity: VerifiedAccountIdentity) {
  const userId = identity.userId
  if (typeof userId !== 'string' || !userId || userId.length > 128 || [...userId].some(character => character.codePointAt(0)! <= 31 || character.codePointAt(0) === 127))
    throw new Error('invalid_account_proof')
  return userId
}

function isHttpsOrigin(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && (url.pathname === '/' || url.pathname === '')
  }
  catch { return false }
}

function safeDeviceName(value: string) {
  const trimmed = value.trim()
  return trimmed.length <= 64
    && [...trimmed].every(character => character.codePointAt(0)! > 31 && character.codePointAt(0) !== 127)
}

function base64url(value: string | Uint8Array) {
  return Buffer.from(value).toString('base64url')
}
