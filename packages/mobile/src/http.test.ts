import type { VerifyIdentityProof } from './account'
import type { AccountDiscoveryConfig } from './discovery'
import type { MobileHost } from './types'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { DeviceStore } from './auth'
import { signEnrollmentTicket } from './discovery'
import { API_PATH, mobileRoutes } from './http'

const accountConfig = {
  cloudbaseEnvId: 'yunlefun-test',
  appId: 'el-bot',
  clientId: 'yun-bot-ios',
  issuer: 'https://www.yunle.fun',
  jwksUrl: 'https://api.yunle.fun/sso-ticket',
}

const discoveryConfig: AccountDiscoveryConfig = {
  ...accountConfig,
  enrollmentSecret: 'a'.repeat(32),
  directory: {
    list: async () => [{
      id: 'cloud-main',
      name: '小云 · 主实例',
      publicOrigin: 'https://bot.example.test',
      state: 'online' as const,
      lastSeen: '2026-11-06T15:00:00.000Z',
      capabilities: ['sessions', 'status'],
      entitlement: 'owner' as const,
    }],
  },
}

const now = () => Date.parse('2026-11-06T15:00:30Z')
const nowDiscoveryConfig: AccountDiscoveryConfig = {
  ...discoveryConfig,
  directory: {
    list: async () => (await discoveryConfig.directory!.list('user-1')).map(item => ({
      ...item,
      lastSeen: new Date(now()).toISOString(),
    })),
  },
}

function host(): MobileHost {
  return {
    list: vi.fn(async () => []),
    conversation: vi.fn(async () => { throw new Error('not used') }),
    models: vi.fn(async () => ({ groups: [] })),
    selectModel: vi.fn(async (_id, route) => route),
    prompt: vi.fn(async () => {}),
    create: vi.fn(async () => 'new-session'),
    status: vi.fn(async () => ({ name: 'Bot', appId: 'test', state: 'online' as const, checkedAt: new Date().toISOString() })),
  }
}

async function listen(handler: ReturnType<typeof mobileRoutes>) {
  const server = createServer(handler)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No test listener')
  return {
    url: `http://127.0.0.1:${address.port}${API_PATH}`,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    },
  }
}

it('gates cloud operations behind pairing, preserves prompt identity and revokes access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-bot-mobile-http-'))
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const pairing = await devices.createPairing()
  const session = { id: 'existing-session', title: 'Existing chat', running: false, updatedAt: new Date().toISOString() }
  const host: MobileHost = {
    list: vi.fn(async () => [session]),
    information: vi.fn<NonNullable<MobileHost['information']>>(async () => ({ ...session, source: { platform: 'qq', kind: 'group', peerId: 'allowed', name: 'Book club' } })),
    conversation: vi.fn(async () => ({ session, messages: [], cursor: 0, hasMore: false })),
    models: vi.fn(async () => ({ current: { provider: 'tokenlink', model: 'hy4' }, groups: [] })),
    selectModel: vi.fn(async (_id, route) => ({ ...route, reasoningEffort: 'medium' })),
    prompt: vi.fn(async () => {}),
    create: vi.fn(async () => 'new-session'),
    status: vi.fn(async () => ({ name: 'Bot', appId: 'test', state: 'online' as const, checkedAt: new Date().toISOString() })),
  }
  const server = createServer(mobileRoutes(host, devices, 'https://bot.example.test'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No test listener')
  const url = `http://127.0.0.1:${address.port}${API_PATH}`
  try {
    expect((await fetch(`${url}/sessions`)).status).toBe(401)
    expect((await fetch(`${url}/sessions/existing-session/info`)).status).toBe(401)
    expect(host.information).not.toHaveBeenCalled()
    expect(host.list).not.toHaveBeenCalled()
    const paired = await fetch(`${url}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: pairing.code, deviceName: 'iPhone' }) })
    expect(paired.status).toBe(200)
    const { token } = await paired.json() as { token: string }
    const headers = { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }
    expect((await fetch(`${url}/sessions`, { headers })).status).toBe(200)
    expect(await (await fetch(`${url}/sessions/existing-session/info`, { headers })).json()).toMatchObject({ source: { peerId: 'allowed', name: 'Book club' } })
    expect(host.information).toHaveBeenCalledExactlyOnceWith('existing-session', expect.any(AbortSignal))
    expect((await fetch(`${url}/sessions/existing-session/info`, { headers, method: 'POST' })).status).toBe(404)
    expect(await (await fetch(`${url}/sessions/existing-session/models`, { headers })).json()).toEqual({
      current: { provider: 'tokenlink', model: 'hy4' },
      groups: [],
    })
    const selected = await fetch(`${url}/sessions/existing-session/model`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ provider: 'openai', model: 'gpt-6-luna' }),
    })
    expect(selected.status).toBe(200)
    expect(await selected.json()).toEqual({
      selected: { provider: 'openai', model: 'gpt-6-luna', reasoningEffort: 'medium' },
    })
    expect(host.selectModel).toHaveBeenCalledWith('existing-session', { provider: 'openai', model: 'gpt-6-luna' }, expect.any(AbortSignal))
    expect((await fetch(`${url}/sessions/existing-session/model`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ provider: 'openai', model: 'contains whitespace' }),
    })).status).toBe(400)
    expect((await fetch(`${url}/sessions/existing-session/messages`, { method: 'POST', headers, body: JSON.stringify({ text: 'Continue this chat', requestId: 'stable-request-id' }) })).status).toBe(202)
    expect(host.prompt).toHaveBeenCalledWith('existing-session', 'Continue this chat', 'stable-request-id', expect.any(AbortSignal))
    expect((await fetch(`${url}/sessions`, { headers: { ...headers, origin: 'https://other.test' } })).status).toBe(403)
    expect((await fetch(`${url}/shell`, { method: 'POST', headers })).status).toBe(404)
    expect((await fetch(`${url}/sessions/existing-session/messages`, { method: 'POST', headers, body: JSON.stringify({ text: 'x'.repeat(4001), requestId: 'request' }) })).status).toBe(400)
    expect((await fetch(`${url}/device`, { method: 'DELETE', headers })).status).toBe(200)
    expect((await fetch(`${url}/sessions`, { headers })).status).toBe(401)
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})

it('keeps account routes disabled until SSO verification is configured', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-bot-account-http-'))
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const pairing = await devices.createPairing()
  const host: MobileHost = {
    list: vi.fn(async () => []),
    conversation: vi.fn(async () => { throw new Error('not used') }),
    models: vi.fn(async () => ({ groups: [] })),
    selectModel: vi.fn(async (_id, route) => route),
    prompt: vi.fn(async () => {}),
    create: vi.fn(async () => 'new-session'),
    status: vi.fn(async () => ({ name: 'Bot', appId: 'test', state: 'online' as const, checkedAt: new Date().toISOString() })),
  }
  const server = createServer(mobileRoutes(host, devices, 'https://bot.example.test'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No test listener')
  const url = `http://127.0.0.1:${address.port}${API_PATH}`
  try {
    const paired = await fetch(`${url}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: pairing.code, deviceName: 'iPhone' }) })
    const { token } = await paired.json() as { token: string }
    const headers = { authorization: `Bearer ${token}` }
    expect((await fetch(`${url}/account`, { headers })).status).toBe(503)
    expect((await fetch(`${url}/account/link`, { method: 'POST', headers, body: '{}' })).status).toBe(503)
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})

it('verifies a linked account proof before syncing bounded preferences', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-bot-account-http-'))
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const pairing = await devices.createPairing()
  const host: MobileHost = {
    list: vi.fn(async () => []),
    conversation: vi.fn(async () => { throw new Error('not used') }),
    models: vi.fn(async () => ({ groups: [] })),
    selectModel: vi.fn(async (_id, route) => route),
    prompt: vi.fn(async () => {}),
    create: vi.fn(async () => 'new-session'),
    status: vi.fn(async () => ({ name: 'Bot', appId: 'test', state: 'online' as const, checkedAt: new Date().toISOString() })),
  }
  const verify: VerifyIdentityProof = vi.fn(async () => ({ userId: 'verified-user', displayName: '云游君' }))
  const server = createServer(mobileRoutes(host, devices, 'https://bot.example.test', () => {}, { config: accountConfig, verify }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No test listener')
  const url = `http://127.0.0.1:${address.port}${API_PATH}`
  try {
    const paired = await fetch(`${url}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: pairing.code, deviceName: 'iPhone' }) })
    const { token } = await paired.json() as { token: string }
    const headers = { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }
    expect(await (await fetch(`${url}/account`, { headers })).json()).toMatchObject({ enabled: true, linked: false })
    const proof = {
      accessToken: 'x'.repeat(32),
      identityAssertion: 'y'.repeat(64),
      nonce: 'z'.repeat(32),
      preferences: { language: 'zh-Hans' },
    }
    const linked = await fetch(`${url}/account/link`, { method: 'POST', headers, body: JSON.stringify(proof) })
    expect(linked.status).toBe(200)
    expect(await linked.json()).toMatchObject({ profile: { userId: 'verified-user' }, preferences: { language: 'zh-Hans' } })
    expect(verify).toHaveBeenCalledWith(
      { accessToken: proof.accessToken, identityAssertion: proof.identityAssertion, nonce: proof.nonce },
      accountConfig,
    )
    const saved = await fetch(`${url}/account/preferences`, { method: 'PUT', headers, body: JSON.stringify({ language: 'en', extra: 'ignored' }) })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ language: 'en' })
    expect(await (await fetch(`${url}/account`, { headers })).json()).toMatchObject({ linked: true, preferences: { language: 'en' } })
    expect((await fetch(`${url}/account`, { method: 'DELETE', headers })).status).toBe(200)
    expect(await (await fetch(`${url}/account`, { headers })).json()).toMatchObject({ enabled: true, linked: false })
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})

it('discovers online instances without a device credential and never exposes a long-lived account bearer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-bot-discovery-http-'))
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const verify: VerifyIdentityProof = vi.fn(async () => ({ userId: 'user-1' }))
  const listener = await listen(mobileRoutes(host(), devices, 'https://bot.example.test', () => {}, undefined, {
    config: nowDiscoveryConfig,
    verify,
    now,
  }))
  try {
    const proof = {
      accessToken: 'x'.repeat(32),
      identityAssertion: 'y'.repeat(64),
      nonce: 'z'.repeat(32),
    }
    const response = await fetch(`${listener.url}/account/instances`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(proof),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ instances: [{ id: 'cloud-main', publicOrigin: 'https://bot.example.test' }] })
    expect(verify).toHaveBeenCalledWith(proof, nowDiscoveryConfig)
    expect((await fetch(`${listener.url}/sessions`)).status).toBe(401)
    expect((await fetch(`${listener.url}/account/instances`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(400)
  }
  finally {
    await listener.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('requires a current signed enrollment ticket before issuing a revocable device credential', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-bot-enroll-http-'))
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  let ticket = ''
  const enrollmentConfig: AccountDiscoveryConfig = {
    ...nowDiscoveryConfig,
    tickets: {
      issue: async (_proof, instances, deviceName) => {
        const signed = signEnrollmentTicket('user-1', instances[0], deviceName, nowDiscoveryConfig, 'client-1234567890', now)
        ticket = signed.ticket
        return { [instances[0].id]: signed.ticket }
      },
      sign: async (userId, selected, deviceName, clientId) => signEnrollmentTicket(userId, selected, deviceName, nowDiscoveryConfig, clientId ?? 'client-1234567890', now).ticket,
    },
  }
  const verify: VerifyIdentityProof = vi.fn(async () => ({ userId: 'user-1' }))
  const listener = await listen(mobileRoutes(host(), devices, 'https://bot.example.test', () => {}, undefined, {
    config: enrollmentConfig,
    verify,
    now,
    redeem: async (signed, enrollment) => devices.enroll(signed, enrollment.instance.id, nowDiscoveryConfig, now),
  }))
  try {
    const proof = {
      accessToken: 'x'.repeat(32),
      identityAssertion: 'y'.repeat(64),
      nonce: 'z'.repeat(32),
    }
    const discovery = await fetch(`${listener.url}/account/instances`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...proof, instanceId: 'cloud-main', deviceName: 'iPhone' }),
    })
    expect(discovery.status).toBe(200)
    const directory = await discovery.json() as { instances: { enrollmentTicket: string }[] }
    ticket = directory.instances[0].enrollmentTicket
    const body = { ...proof, ticket, instanceId: 'cloud-main', deviceName: 'iPhone' }
    const enrolled = await fetch(`${listener.url}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(enrolled.status).toBe(200)
    const credential = await enrolled.json() as { token: string, device: { id: string } }
    expect(credential.token).toMatch(/^[\w-]{43}$/)
    expect((await fetch(`${listener.url}/device`, { headers: { authorization: `Bearer ${credential.token}` } })).status).toBe(200)
    expect((await fetch(`${listener.url}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })).status).toBe(400)
    expect(devices.list()).toHaveLength(1)
    await devices.revoke(credential.device.id)
    expect((await fetch(`${listener.url}/device`, { headers: { authorization: `Bearer ${credential.token}` } })).status).toBe(401)
  }
  finally {
    await listener.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('requires a fresh device-bound deletion confirmation and keeps group routes independently authenticated', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mobile-management-http-'))
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const session = { id: 'session-one', title: 'History', running: false, updatedAt: '2026-11-07T00:00:00.000Z' }
  const bridge: MobileHost = {
    ...host(),
    list: async () => [session],
    archive: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    groups: vi.fn<NonNullable<MobileHost['groups']>>(async () => [{ id: 'group-one', source: { platform: 'qq', kind: 'group', name: 'Test group' }, membership: 'joined', allowed: true }]),
    openGroup: vi.fn(async () => 'fresh-session'),
  }
  const server = await listen(mobileRoutes(bridge, devices, 'https://bot.example.test'))
  try {
    for (const [path, method] of [['groups', 'GET'], ['sessions/session-one/archive', 'PUT'], ['sessions/session-one/deletion', 'POST'], ['sessions/session-one', 'DELETE'], ['groups/group-one/conversation', 'POST']])
      expect((await fetch(`${server.url}/${path}`, { method })).status).toBe(401)
    const pair = async (name: string) => {
      const { code } = await devices.createPairing()
      const response = await fetch(`${server.url}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, deviceName: name }) })
      const { token } = await response.json() as { token: string }
      return { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }
    }
    const headers = await pair('first')
    const second = await pair('second')
    const prepare = async () => {
      const response = await fetch(`${server.url}/sessions/session-one/deletion`, { method: 'POST', headers })
      expect(response.status).toBe(200)
      return await response.json() as { confirmation: string }
    }
    const erase = (confirmation: string, credentials = headers, id = 'session-one') => fetch(`${server.url}/sessions/${id}`, {
      method: 'DELETE',
      headers: credentials,
      body: JSON.stringify({ confirmation }),
    })
    expect((await erase('unissued')).status).toBe(409)
    const first = await prepare()
    expect((await erase(first.confirmation, second)).status).toBe(409)
    expect((await erase(first.confirmation, headers, 'other-session')).status).toBe(409)
    expect((await erase(first.confirmation)).status).toBe(200)
    expect((await erase(first.confirmation)).status).toBe(409)
    expect(bridge.delete).toHaveBeenCalledTimes(1)
    const changed = await prepare()
    session.updatedAt = '2026-11-07T00:01:00.000Z'
    expect((await erase(changed.confirmation)).status).toBe(409)
    session.running = true
    expect((await fetch(`${server.url}/sessions/session-one/deletion`, { method: 'POST', headers })).status).toBe(409)
    expect((await erase(changed.confirmation)).status).toBe(409)
    session.running = false
    const expiring = await prepare()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000)
    try {
      expect((await erase(expiring.confirmation)).status).toBe(409)
    }
    finally { clock.mockRestore() }
    expect((await fetch(`${server.url}/sessions/session-one/archive`, { method: 'PUT', headers, body: JSON.stringify({ archived: 'yes' }) })).status).toBe(400)
    expect((await fetch(`${server.url}/sessions/session-one/archive`, { method: 'PUT', headers, body: JSON.stringify({ archived: true }) })).status).toBe(200)
    expect(bridge.archive).toHaveBeenCalledWith('session-one', true, expect.any(AbortSignal))
    expect((await fetch(`${server.url}/groups`, { headers })).status).toBe(200)
    expect(await (await fetch(`${server.url}/groups/group-one/conversation`, { method: 'POST', headers })).json()).toEqual({ sessionId: 'fresh-session' })
    expect(bridge.openGroup).toHaveBeenCalledExactlyOnceWith('group-one', expect.any(AbortSignal))
    expect((await fetch(`${server.url}/groups`, { headers: { ...headers, origin: 'https://foreign.test' } })).status).toBe(403)
  }
  finally {
    await server.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('authenticates cloud restart and preserves the explicit force choice', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mobile-restart-http-'))
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const restart = vi.fn(async () => {})
  const server = await listen(mobileRoutes(host(), devices, 'https://bot.example.test', undefined, undefined, undefined, undefined, undefined, undefined, { restart }))
  try {
    expect((await fetch(`${server.url}/system/restart`, { method: 'POST' })).status).toBe(401)
    const { code } = await devices.createPairing()
    const paired = await fetch(`${server.url}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, deviceName: 'iPhone' }) })
    const { token } = await paired.json() as { token: string }
    const headers = { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }

    const normal = await fetch(`${server.url}/system/restart`, { method: 'POST', headers, body: JSON.stringify({ force: false }) })
    expect(normal.status).toBe(202)
    expect(await normal.json()).toEqual({ ok: true, restarting: true })
    expect(restart).toHaveBeenCalledWith(false, expect.any(AbortSignal))

    expect((await fetch(`${server.url}/system/restart`, { method: 'POST', headers, body: JSON.stringify({ force: 'yes' }) })).status).toBe(400)
    const forced = await fetch(`${server.url}/system/restart`, { method: 'POST', headers, body: JSON.stringify({ force: true }) })
    expect(forced.status).toBe(202)
    expect(restart).toHaveBeenLastCalledWith(true, expect.any(AbortSignal))
  }
  finally {
    await server.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('authenticates native QQ takeover routes and rejects model sessions, archives and cross-device sends', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-qq-http-'))
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const { QQChatAdapter } = await import('./qq-chat')
  const service = {
    view: vi.fn(async () => ({ messages: [], control: { id: 'allowed-group' } })),
    request: vi.fn(async (_id: string, input: Record<string, unknown>) => input.operation === 'preview'
      ? { id: 'native-preview', expiresAt: Date.now() + 120_000, text: input.text }
      : { id: input.preview, status: 'sent' }),
    member: vi.fn(async (_id: string, senderId: string) => ({ senderId, impression: { text: '喜欢猫', updatedAt: '2026-11-07T08:00:00.000Z' } })),
    sources: () => ({}),
  }
  const adapter = new QQChatAdapter(join(directory, 'grants.json'), () => service)
  await adapter.load()
  const group = { id: 'group-session', title: 'Allowed group', running: false, updatedAt: new Date().toISOString(), archived: false, source: { platform: 'qq' as const, kind: 'group' as const }, context: { usedTokens: 14500, contextWindow: 1048576, usageSource: 'projected' as const } }
  const bridge = { ...host(), list: async () => [group, { id: 'model-session', title: 'Model', running: false, updatedAt: group.updatedAt }] }
  const server = await listen(mobileRoutes(bridge, devices, 'https://bot.example.test', undefined, undefined, undefined, undefined, undefined, adapter))
  try {
    const url = `${server.url}/sessions/group-session/qq`
    expect((await fetch(url)).status).toBe(401)
    const pair = async () => {
      const { code } = await devices.createPairing()
      const response = await fetch(`${server.url}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, deviceName: 'test' }) })
      const { token } = await response.json() as { token: string }
      return { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }
    }
    const headers = await pair()
    const otherDevice = await pair()
    const snapshot = await fetch(url, { headers })
    expect(snapshot.status).toBe(200)
    expect(await snapshot.json()).toMatchObject({ context: group.context })
    const member = await fetch(`${url}/members/member-1`, { headers })
    expect(member.status).toBe(200)
    expect(await member.json()).toEqual({ senderId: 'member-1', impression: { text: '喜欢猫', updatedAt: '2026-11-07T08:00:00.000Z' } })
    expect(service.member).toHaveBeenCalledExactlyOnceWith('group-session', 'member-1')
    expect((await fetch(`${url}/members/member-1`, { method: 'POST', headers })).status).toBe(405)
    expect((await fetch(`${server.url}/sessions/model-session/qq`, { headers })).status).toBe(404)
    expect((await fetch(`${server.url}/sessions/model-session/qq/members/member-1`, { headers })).status).toBe(404)
    expect((await fetch(`${url}?before=-1`, { headers })).status).toBe(400)
    const post = (value: object, credentials = headers) => fetch(url, { method: 'POST', headers: credentials, body: JSON.stringify(value) })
    expect((await post({ operation: 'preview', text: 'exact', mode: 'reply', lease: 'lease' })).status).toBe(200)
    expect((await post({ operation: 'send', preview: 'native-preview' }, otherDevice)).status).toBe(409)
    expect((await post({ operation: 'send', preview: 'native-preview' })).status).toBe(200)
    group.archived = true
    expect((await post({ operation: 'begin' })).status).toBe(409)
    expect((await fetch(url, { headers: { ...headers, origin: 'https://foreign.invalid' } })).status).toBe(403)
    expect(bridge.prompt).not.toHaveBeenCalled()
  }
  finally {
    await server.close()
    await rm(directory, { recursive: true, force: true })
  }
})

it('only exposes host resource metrics to an active paired device', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-host-status-http-'))
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const pairing = await devices.createPairing()
  const target = host()
  const metrics = {
    sampledAt: new Date().toISOString(),
    stale: false,
    hostname: 'physical-host',
    cpu: { count: 2, usagePercent: 12.5, sampleSeconds: 1 },
    memory: { totalBytes: 4096, usedBytes: 1024, availableBytes: 3072, usagePercent: 25 },
    disks: [{ mountPoint: '/', totalBytes: 10000, usedBytes: 3000, availableBytes: 6000, usagePercent: 33.3 }],
  }
  target.status = vi.fn(async () => ({ name: 'Bot', appId: 'test', state: 'online' as const, checkedAt: metrics.sampledAt, host: metrics }))
  const server = await listen(mobileRoutes(target, devices, 'https://bot.example.test'))
  try {
    expect((await fetch(`${server.url}/status`)).status).toBe(401)
    expect(target.status).not.toHaveBeenCalled()
    const paired = await (await fetch(`${server.url}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: pairing.code, deviceName: 'Metrics test' }),
    })).json() as { token: string }
    const headers = { authorization: `Bearer ${paired.token}` }
    const response = await fetch(`${server.url}/status`, { headers })
    expect(response.status).toBe(200)
    expect((await response.json() as { host: unknown }).host).toEqual(metrics)
    expect(target.status).toHaveBeenCalledOnce()
    expect((await fetch(`${server.url}/device`, { method: 'DELETE', headers })).status).toBe(200)
    expect((await fetch(`${server.url}/status`, { headers })).status).toBe(401)
    expect(target.status).toHaveBeenCalledOnce()
  }
  finally {
    await server.close()
    await rm(directory, { recursive: true, force: true })
  }
})
