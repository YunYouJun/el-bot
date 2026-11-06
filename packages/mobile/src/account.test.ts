import { expect, it, vi } from 'vitest'
import { accountPublicState, linkedAccount, normalizePreferences } from './account'

const config = {
  cloudbaseEnvId: 'yunlefun-test',
  appId: 'el-bot',
  clientId: 'yun-bot-ios',
  issuer: 'https://www.yunle.fun',
  jwksUrl: 'https://api.yunle.fun/sso-ticket',
}

it('keeps account sync disabled until the server is configured', () => {
  expect(accountPublicState(undefined, undefined)).toEqual({ enabled: false, linked: false })
  expect(accountPublicState(config, undefined)).toEqual({ enabled: true, linked: false })
})

it('sanitizes language preferences and never returns unverified profile fields', async () => {
  const now = () => Date.parse('2026-11-06T00:00:00Z')
  const preferences = normalizePreferences({ language: 'fr-FR' }, now)
  expect(preferences).toEqual({ language: '', updatedAt: '2026-11-06T00:00:00.000Z' })
  const account = linkedAccount({ userId: 'user-1', displayName: '云游君' }, preferences, now)
  const state = accountPublicState(config, account)
  expect(state.enabled).toBe(true)
  expect(state.linked).toBe(true)
  expect(state.profile?.userId).toBe('user-1')
  expect(state.preferences?.language).toBe('')
})

it('rejects unverified account proofs before changing persisted state', async () => {
  const { linkAccount } = await import('./account')
  const commit = vi.fn(async () => undefined)
  const verify = vi.fn(async () => {
    throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' })
  })
  await expect(linkAccount(
    { accessToken: 'token', identityAssertion: 'assertion', nonce: 'nonce' },
    { language: 'en' },
    config,
    { commit },
    verify,
  )).rejects.toThrow('AUTH_REQUIRED')
  expect(commit).not.toHaveBeenCalled()
})
