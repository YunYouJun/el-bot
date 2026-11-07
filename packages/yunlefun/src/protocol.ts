import type { webcrypto } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto'

export type JsonWebKey = webcrypto.JsonWebKey
export const CLIENT_ID = 'el-bot-cloud'
export const APPLICATION_ID = 'el-bot'
export const SCOPE = 'ai:agent'
export const AUTH_ENDPOINT = 'https://api.yunle.fun/desktop-auth'
export const AGENT_PATH = '/ai/v1/el-bot/agent'
export const DEFAULT_RUNTIME_ORIGIN = 'https://ai-runtime-193029-4-1325586649.sh.run.tcloudbase.com'
const ISSUER = 'https://www.yunle.fun'
const ISSUER_KEYS: Record<string, JsonWebKey> = { 'desktop-2026-06': { kty: 'OKP', crv: 'Ed25519', x: 'XMgjAUTRx4E1C2IYkW-XZZyCNIWy8OkX_L2EK_AXR9I' } }
export class YunlefunError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code)
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new YunlefunError('INVALID_RESPONSE')
  return value as Record<string, unknown>
}
export function hash(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}
export function installationKey(): JsonWebKey {
  return generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' })
}
export function publicKey(key: JsonWebKey): JsonWebKey {
  if (key.kty !== 'EC' || key.crv !== 'P-256' || !key.x || !key.y || !key.d)
    throw new YunlefunError('INVALID_INSTALLATION_KEY')
  return { crv: 'P-256', kty: 'EC', x: key.x, y: key.y }
}
export function proof(key: JsonWebKey, endpoint: string, entitlement?: string, request?: string, now = Date.now()): string {
  const header = Buffer.from(JSON.stringify({ typ: 'dpop+jwt', alg: 'ES256', jwk: publicKey(key) })).toString('base64url')
  const claims = Buffer.from(JSON.stringify({ htm: 'POST', htu: endpoint, iat: Math.floor(now / 1000), jti: randomUUID(), ...(entitlement ? { ath: hash(entitlement) } : {}), ...(request === undefined ? {} : { request_hash: hash(request) }) })).toString('base64url')
  const unsigned = `${header}.${claims}`
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key: createPrivateKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
}
/** Verify an issuer signature and exact installation, application, audience and consent. */
export function entitlementIdentity(token: string, key: JsonWebKey, now = Date.now(), anchors = ISSUER_KEYS): {
  uid: string
  expiresAt: number
} {
  try {
    const parts = token.split('.')
    if (token.length > 32000 || parts.length !== 3)
      throw new Error('invalid token')
    const header = object(JSON.parse(Buffer.from(parts[0]!, 'base64url').toString()))
    const claims = object(JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()))
    const anchor = typeof header.kid === 'string' && Object.hasOwn(anchors, header.kid) ? anchors[header.kid] : undefined
    const seconds = Math.floor(now / 1000)
    if (!anchor || header.alg !== 'EdDSA' || header.typ !== 'ylf-entitlement+jwt' || !verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: anchor, format: 'jwk' }), Buffer.from(parts[2]!, 'base64url'))
      || claims.iss !== ISSUER || claims.aud !== CLIENT_ID || claims.app_id !== APPLICATION_ID
      || typeof claims.sub !== 'string' || !/^[\w.:-]{1,256}$/.test(claims.sub) || claims.sub === 'anon'
      || !Array.isArray(claims.scope) || claims.scope.length !== 2 || !claims.scope.includes('membership:read') || !claims.scope.includes(SCOPE)
      || typeof claims.grant_id !== 'string' || !claims.grant_id || claims.grant_id.length > 128
      || typeof claims.jti !== 'string' || !claims.jti || claims.jti.length > 256
      || !Number.isSafeInteger(claims.iat) || Number(claims.iat) > seconds || !Number.isSafeInteger(claims.nbf) || Number(claims.nbf) > seconds
      || !Number.isSafeInteger(claims.exp) || Number(claims.exp) <= seconds || Number(claims.exp) <= Number(claims.iat) || Number(claims.exp) - Number(claims.iat) > 7 * 86400
      || object(claims.cnf).jkt !== hash(JSON.stringify(publicKey(key)))) {
      throw new Error('invalid claims')
    }
    return { uid: claims.sub, expiresAt: Number(claims.exp) * 1000 }
  }
  catch {
    throw new YunlefunError('INVALID_ENTITLEMENT', 401)
  }
}
export function runtimeEndpoint(origin: string): string {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== origin || url.search || url.hash)
    throw new YunlefunError('INVALID_RUNTIME_ORIGIN')
  return `${url.origin}${AGENT_PATH}`
}
export type Fetch = typeof fetch
/** Read a bounded response and reject redirects before forwarding any proof or entitlement. */
export async function jsonRequest(endpoint: string, input: unknown, key: JsonWebKey, options: {
  entitlement?: string
  signal?: AbortSignal
  fetch?: Fetch
} = {}): Promise<Record<string, unknown>> {
  const request = JSON.stringify(input)
  let response: Response
  try {
    response = await (options.fetch ?? fetch)(endpoint, { method: 'POST', redirect: 'error', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json', 'DPoP': proof(key, endpoint, options.entitlement, options.entitlement ? request : undefined), ...(options.entitlement ? { Authorization: `DPoP ${options.entitlement}` } : {}) }, body: options.entitlement ? JSON.stringify({ request }) : request })
  }
  catch {
    throw new YunlefunError(options.signal?.aborted ? 'CANCELLED' : 'NETWORK_UNCERTAIN', 503)
  }
  const reader = response.body?.getReader()
  if (!reader)
    throw new YunlefunError('INVALID_RESPONSE', 503)
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done)
        break
      length += chunk.value.byteLength
      if (length > 1024 * 1024)
        throw new YunlefunError('INVALID_RESPONSE', 503)
      chunks.push(chunk.value)
    }
    const result = object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (!response.ok || result.error) {
      const error = result.error && typeof result.error === 'object' ? object(result.error) : result
      const code = typeof error.code === 'string' && /^[\w-]{1,80}$/.test(error.code) ? error.code : 'REQUEST_FAILED'
      throw new YunlefunError(code, response.status >= 400 ? response.status : 503)
    }
    // desktop-auth uses a { ok, data } envelope; Runtime uses plain JSON.
    if (result.ok === false) {
      const code = typeof result.code === 'string' ? result.code : 'AUTH_REQUIRED'
      throw new YunlefunError(code, response.status)
    }
    return result.ok === true && result.data !== undefined ? object(result.data) : result
  }
  catch (error) {
    throw error instanceof YunlefunError ? error : new YunlefunError('INVALID_RESPONSE', 503)
  }
  finally {
    await reader.cancel().catch(() => {
    })
  }
}
