export interface AccountProfile {
  userId: string
  handle?: string
  displayName?: string
  avatarUrl?: string
  linkedAt: string
}

export interface AccountPreferences {
  language: string
  updatedAt: string
}

export interface AccountState {
  enabled: boolean
  linked: boolean
  profile?: AccountProfile
  preferences?: AccountPreferences
}

export interface AccountSyncConfig {
  cloudbaseEnvId: string
  appId: string
  clientId: string
  issuer: string
  jwksUrl: string
  requiredScope?: string
  requireVerifiedPhone?: boolean
}

export interface VerifiedAccountIdentity {
  userId: string
  handle?: string
  displayName?: string
  avatarUrl?: string
}

export type VerifyIdentityProof = (
  proof: { accessToken: string, identityAssertion: string, nonce: string },
  config: AccountSyncConfig,
) => Promise<VerifiedAccountIdentity>

export interface StoredAccount {
  subject: string
  handle?: string
  displayName?: string
  avatarUrl?: string
  linkedAt: string
  preferences: AccountPreferences
}

export function normalizePreferences(input: unknown, now: () => number = Date.now): AccountPreferences {
  const value = input as { language?: unknown } | undefined
  const language = value?.language === '' || value?.language === 'en' || value?.language === 'zh-Hans' ? value.language : ''
  return { language, updatedAt: new Date(now()).toISOString() }
}

export function accountPublicState(config: AccountSyncConfig | undefined, account: StoredAccount | undefined): AccountState {
  if (!config)
    return { enabled: false, linked: false }
  if (!account)
    return { enabled: true, linked: false }
  return {
    enabled: true,
    linked: true,
    profile: {
      userId: account.subject,
      ...account.handle ? { handle: account.handle } : {},
      ...account.displayName ? { displayName: account.displayName } : {},
      ...account.avatarUrl ? { avatarUrl: account.avatarUrl } : {},
      linkedAt: account.linkedAt,
    },
    preferences: account.preferences,
  }
}

export function linkedAccount(
  identity: VerifiedAccountIdentity,
  preferences: AccountPreferences,
  now: () => number = Date.now,
): StoredAccount {
  const bounded = (value: string | undefined, limit: number) => value && value.length <= limit ? value : undefined
  return {
    subject: identity.userId,
    ...bounded(identity.handle, 64) ? { handle: identity.handle } : {},
    ...bounded(identity.displayName, 128) ? { displayName: identity.displayName } : {},
    ...bounded(identity.avatarUrl, 2048) ? { avatarUrl: identity.avatarUrl } : {},
    linkedAt: new Date(now()).toISOString(),
    preferences: normalizePreferences(preferences, now),
  }
}

export interface AccountStore {
  account?: StoredAccount
  commit: (account: StoredAccount | undefined) => Promise<void>
}

export async function linkAccount(
  proof: { accessToken: string, identityAssertion: string, nonce: string },
  preferences: unknown,
  config: AccountSyncConfig | undefined,
  store: AccountStore,
  verify: VerifyIdentityProof,
  now: () => number = Date.now,
) {
  if (!config)
    throw new Error('account_not_configured')
  const identity = await verify(proof, config)
  if (!identity.userId || identity.userId.length > 128 || [...identity.userId].some(character => character.codePointAt(0)! <= 31 || character.codePointAt(0) === 127))
    throw new Error('invalid_account_proof')
  const account = linkedAccount(identity, normalizePreferences(preferences, now), now)
  await store.commit(account)
  return { profile: accountPublicState(config, account).profile!, preferences: account.preferences }
}
