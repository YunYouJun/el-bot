import { expect, it, vi } from 'vitest'
import { discoverInstances, issueEnrollmentTicket, sanitizeInstances, signEnrollmentTicket, verifyEnrollmentTicket } from './discovery'

const config = {
  cloudbaseEnvId: 'yunlefun-test',
  appId: 'el-bot',
  clientId: 'yun-bot-ios',
  issuer: 'https://www.yunle.fun',
  jwksUrl: 'https://api.yunle.fun/sso-ticket',
  enrollmentSecret: 'a'.repeat(32),
}

const instance = {
  id: 'cloud-main',
  name: '小云 · 主实例',
  publicOrigin: 'https://bot.yunle.fun',
  state: 'online' as const,
  lastSeen: '2026-11-06T15:00:00.000Z',
  capabilities: ['sessions', 'status'],
  entitlement: 'owner' as const,
}

const proof = {
  accessToken: 'x'.repeat(32),
  identityAssertion: 'y'.repeat(64),
  nonce: 'z'.repeat(32),
}

it('publishes only fresh owner instances with bounded display fields', async () => {
  const now = () => Date.parse('2026-11-06T15:00:30Z')
  const directory = { list: vi.fn(async () => [instance, { ...instance, id: 'stale', lastSeen: '2026-11-06T14:00:00.000Z' }]) }
  const verify = vi.fn(async () => ({ userId: 'user-1' }))
  const result = await discoverInstances(proof, { ...config, directory }, verify, now)
  expect(result.userId).toBe('user-1')
  expect(result.instances.map(item => item.id)).toEqual(['cloud-main'])
})

it('rejects an unverified account proof before querying the instance directory', async () => {
  const directory = { list: vi.fn(async () => [instance]) }
  const verify = vi.fn(async () => {
    throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' })
  })
  await expect(discoverInstances(proof, { ...config, directory }, verify)).rejects.toThrow('AUTH_REQUIRED')
  expect(directory.list).not.toHaveBeenCalled()
})

it('signs short-lived tickets and refuses expired, tampered or replayed values', () => {
  const now = () => Date.parse('2026-11-06T15:00:00Z')
  const signed = signEnrollmentTicket('user-1', instance, 'iPhone', config, 'client-1234567890', now)
  expect(verifyEnrollmentTicket(signed.ticket, 'cloud-main', config, now)).toMatchObject({
    userId: 'user-1',
    instanceId: 'cloud-main',
    clientId: 'client-1234567890',
  })
  expect(() => verifyEnrollmentTicket(signed.ticket, 'cloud-main', config, () => now() + 60_001)).toThrow('invalid_enrollment')
  expect(() => verifyEnrollmentTicket(`${signed.ticket.slice(0, -2)}AA`, 'cloud-main', config, now)).toThrow('invalid_enrollment')
  expect(() => verifyEnrollmentTicket(signed.ticket, 'other-instance', config, now)).toThrow('invalid_enrollment')
})

it('keeps discovery disabled when no enrollment secret is configured', () => {
  expect(() => issueEnrollmentTicket('user-1', instance, 'iPhone', { ...config, enrollmentSecret: undefined })).toThrow('account_not_configured')
})

it('bounds directory entries before returning them to a native client', () => {
  expect(sanitizeInstances([{ ...instance, publicOrigin: 'http://bot.yunle.fun' }])).toEqual([])
  expect(sanitizeInstances([{ ...instance, capabilities: ['shell', 'status'] }])[0].capabilities).toEqual(['status'])
})
