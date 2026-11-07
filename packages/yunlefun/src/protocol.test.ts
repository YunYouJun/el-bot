import { Buffer } from 'node:buffer'
import { createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AUTH_ENDPOINT, CLIENT_ID, entitlementIdentity, hash, installationKey, proof, publicKey, runtimeEndpoint } from './protocol'

describe('yunLeFun installation-bound authorization', () => {
  it('signs fresh proofs over the exact endpoint, entitlement and request without exporting a private key', () => {
    const key = installationKey()
    const token = proof(key, AUTH_ENDPOINT, 'entitlement', '{"action":"account"}')
    const parts = token.split('.')
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString())
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString())
    expect(header.jwk).not.toHaveProperty('d')
    expect(claims).toMatchObject({ htm: 'POST', htu: AUTH_ENDPOINT, ath: hash('entitlement'), request_hash: hash('{"action":"account"}') })
    expect(verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: createPublicKey({ key: publicKey(key), format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2]!, 'base64url'))).toBe(true)
    expect(proof(key, AUTH_ENDPOINT)).not.toBe(proof(key, AUTH_ENDPOINT))
  })
  it('verifies issuer signatures and rejects wrong-account capabilities, audiences, installations and expiry', () => {
    const key = installationKey()
    const issuer = generateKeyPairSync('ed25519')
    const now = Date.now()
    const seconds = Math.floor(now / 1000)
    const claims = { iss: 'https://www.yunle.fun', aud: CLIENT_ID, app_id: 'el-bot', sub: 'user-1', scope: ['membership:read', 'ai:agent'], grant_id: 'grant', jti: 'token', iat: seconds, nbf: seconds, exp: seconds + 3600, cnf: { jkt: hash(JSON.stringify(publicKey(key))) } }
    const token = (overrides = {}) => {
      const unsigned = [Buffer.from(JSON.stringify({ typ: 'ylf-entitlement+jwt', alg: 'EdDSA', kid: 'test' })).toString('base64url'), Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString('base64url')].join('.')
      return `${unsigned}.${sign(null, Buffer.from(unsigned), issuer.privateKey).toString('base64url')}`
    }
    const anchors = { test: issuer.publicKey.export({ format: 'jwk' }) }
    expect(entitlementIdentity(token(), key, now, anchors).uid).toBe('user-1')
    for (const override of [{ aud: 'cms-desktop' }, { app_id: 'cms' }, { scope: ['membership:read'] }, { exp: seconds - 1 }, { cnf: { jkt: 'other-installation' } }])
      expect(() => entitlementIdentity(token(override), key, now, anchors)).toThrow('INVALID_ENTITLEMENT')
    expect(() => entitlementIdentity(token(), installationKey(), now, anchors)).toThrow('INVALID_ENTITLEMENT')
  })
  it('allows only an explicit HTTPS origin for the trusted model gateway', () => {
    expect(runtimeEndpoint('https://runtime.example')).toBe('https://runtime.example/ai/v1/el-bot/agent')
    for (const origin of ['http://runtime.example', 'https://user:secret@runtime.example', 'https://runtime.example/other', 'https://runtime.example?token=secret'])
      expect(() => runtimeEndpoint(origin)).toThrow()
  })
})
