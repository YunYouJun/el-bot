import type { InboundContext, SecurityManager } from './contracts'
import type { ManualBridge } from './manual'
import type { Delivery, ManualPreview, ManualStateView, ManualTarget } from './manual-types'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManualControl } from './manual'
import { manualRoutes } from './manual-http'
import { digest, QQSecurity } from './policy'
import { SecurityStore } from './store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'qq-manual-'))
  directories.push(directory)
  let time = 1_800_000_000_000
  const now = () => time
  const target: ManualTarget = { id: digest('group-a'), scope: 'group', peerId: 'group-a', sessionId: 'safe-session', title: '测试群' }
  const other = { ...target, id: digest('group-b'), peerId: 'group-b', sessionId: 'other-session', title: '另一个群' }
  const targets = [target, other]
  const bridge: ManualBridge = {
    targets: async () => targets,
    drain: vi.fn(async () => {}),
    quota: vi.fn(async () => true),
    send: vi.fn(async () => ({ id: 'qq-message-1' })),
    reserveReply: vi.fn(),
  }
  const control = new ManualControl(join(directory, 'manual.json'), bridge, now)
  await control.initialize()
  control.online = true
  const begin = async (seconds = 600) => {
    await control.request({ operation: 'begin', target: target.id, seconds })
    return (await control.view()).sessions[0].lease!
  }
  const preview = async (text = '原文', mode: 'reply' | 'proactive' = 'proactive') => {
    const lease = (await control.view()).sessions[0].lease!
    return await control.request({ operation: 'preview', target: target.id, lease: lease.id, text, mode }) as ManualPreview
  }
  return { directory, target, other, targets, bridge, control, now, begin, preview, advance: (ms: number) => {
    time += ms
  } }
}

describe('owner manual takeover', () => {
  it('pauses only the selected chat before draining, previews exact text, and confirms a single raw send', async () => {
    const f = await fixture()
    let release!: () => void
    vi.mocked(f.bridge.drain).mockImplementationOnce(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    const beginning = f.begin()
    await vi.waitFor(() => expect(f.control.paused(f.target.id)).toBe(true))
    expect(f.control.paused(f.other.id)).toBe(false)
    expect(f.bridge.send).not.toHaveBeenCalled()
    release()
    await beginning
    const text = '  原文\n**不是 Markdown**\n<@all>  '
    const preview = await f.preview(text)
    expect(preview.text).toBe(text)
    expect(f.bridge.send).not.toHaveBeenCalled()
    const request = Object.assign({ operation: 'send' as const, preview: preview.id }, { text: '篡改的文字', target: f.other.id })
    const receipts = await Promise.all(Array.from({ length: 10 }, () => f.control.request(request)))
    expect(f.bridge.send).toHaveBeenCalledExactlyOnceWith(f.target, text, 'proactive', undefined)
    expect(receipts.every(row => (row as Delivery).status === 'sent')).toBe(true)
    expect(f.bridge.quota).toHaveBeenCalledOnce()
    const stored = await readFile(f.control.path, 'utf8')
    expect(stored).not.toContain(text)
    if (process.platform !== 'win32')
      expect((await stat(f.control.path)).mode & 0o777).toBe(0o600)
  })

  it('restores leases across restart, ends or expires them, and fences old automatic replies until fresh input', async () => {
    const f = await fixture()
    const lease = await f.begin(30)
    f.control.observe(f.target.id, 'during-manual', 'hello', true)
    const restart = new ManualControl(f.control.path, f.bridge, f.now)
    await restart.initialize()
    expect(restart.paused(f.target.id)).toBe(true)
    expect(restart.pausedSession(f.target.sessionId)).toBe(true)
    f.advance(30_001)
    expect(restart.paused(f.target.id)).toBe(false)
    expect(restart.automaticAllowed(f.target.id, 'old')).toBe(false)
    restart.observe(f.target.id, 'new-input', 'new message', true)
    expect(restart.automaticAllowed(f.target.id, 'new-input')).toBe(true)
    expect(restart.automaticAllowed(f.target.id, 'old')).toBe(false)
    await expect(f.control.request({ operation: 'end', target: f.target.id, lease: lease.id })).rejects.toMatchObject({ code: 'lease_expired' })
    const next = await f.begin()
    await f.control.request({ operation: 'end', target: f.target.id, lease: next.id })
    expect(f.control.paused(f.target.id)).toBe(false)
    expect(f.control.automaticAllowed(f.target.id, 'during-manual')).toBe(false)
  })

  it('requires a current lease and fresh preview, rejecting changed sessions and removed whitelist targets', async () => {
    const f = await fixture()
    await expect(f.preview()).rejects.toBeDefined()
    await expect(f.control.request({ operation: 'begin', target: 'unlisted' })).rejects.toMatchObject({ code: 'not_found' })
    await f.begin()
    await expect(f.control.request({ operation: 'preview', target: f.target.id, lease: 'forged-owner', text: 'hi', mode: 'proactive' })).rejects.toMatchObject({ code: 'lease_expired' })
    const preview = await f.preview()
    f.target.sessionId = 'replacement'
    await expect(f.control.request({ operation: 'send', preview: preview.id })).rejects.toMatchObject({ code: 'stale_session' })
    const current = await f.preview()
    f.targets.splice(0, 1)
    await expect(f.control.request({ operation: 'send', preview: current.id })).rejects.toMatchObject({ code: 'not_found' })
    expect(f.bridge.send).not.toHaveBeenCalled()
  })

  it('consumes expired or replaced previews without sending and rejects invalid raw text', async () => {
    const f = await fixture()
    await f.begin()
    for (const text of ['', ' ', 'x'.repeat(1201), '\0secret', '\uD800'])
      await expect(f.preview(text)).rejects.toMatchObject({ code: 'invalid_text' })
    const older = await f.preview('old')
    await f.preview('new')
    await expect(f.control.request({ operation: 'send', preview: older.id })).rejects.toMatchObject({ code: 'preview_expired' })
    const expires = await f.preview('expires')
    f.advance(120_001)
    await expect(f.control.request({ operation: 'send', preview: expires.id })).rejects.toMatchObject({ code: 'preview_expired' })
    expect(f.bridge.send).not.toHaveBeenCalled()
  })

  it('preserves rate limits and never silently falls back from an expired reply to a proactive send', async () => {
    const f = await fixture()
    await f.begin()
    await expect(f.preview('reply', 'reply')).rejects.toMatchObject({ code: 'reply_expired' })
    f.control.observe(f.target.id, 'anchor', 'hello', true)
    const preview = await f.preview('reply', 'reply')
    vi.mocked(f.bridge.quota).mockResolvedValueOnce(false)
    await expect(f.control.request({ operation: 'send', preview: preview.id })).rejects.toMatchObject({ code: 'rate_limited' })
    expect(f.bridge.send).not.toHaveBeenCalled()
    await f.control.request({ operation: 'send', preview: preview.id })
    expect(f.bridge.send).toHaveBeenCalledExactlyOnceWith(f.target, 'reply', 'reply', 'anchor')
    expect(f.bridge.reserveReply).toHaveBeenCalledExactlyOnceWith(f.target, 'anchor')
  })

  it('records platform denial and uncertain delivery without retrying, even after process restart', async () => {
    const f = await fixture()
    await f.begin()
    const denied = await f.preview('permission')
    vi.mocked(f.bridge.send).mockRejectedValueOnce(Object.assign(new Error('private SDK details'), { bizCode: '40034105', httpStatus: 403 }))
    expect(await f.control.request({ operation: 'send', preview: denied.id })).toMatchObject({ status: 'failed', code: '40034105' })
    expect((await f.control.view()).sessions[0].proactivePermission).toBe('denied')
    const uncertain = await f.preview('network timeout')
    vi.mocked(f.bridge.send).mockRejectedValueOnce(new Error('timeout'))
    expect(await f.control.request({ operation: 'send', preview: uncertain.id })).toMatchObject({ status: 'unknown', code: 'delivery_unknown' })
    await f.control.request({ operation: 'send', preview: uncertain.id })
    const restarted = new ManualControl(f.control.path, f.bridge, f.now)
    await restarted.initialize()
    restarted.online = true
    expect(await restarted.request({ operation: 'send', preview: uncertain.id })).toMatchObject({ status: 'unknown' })
    expect(f.bridge.send).toHaveBeenCalledTimes(2)
    expect(await readFile(f.control.path, 'utf8')).not.toContain('private SDK details')
  })

  it('fails closed when persisted handoff state is damaged', async () => {
    const f = await fixture()
    await writeFile(f.control.path, '{broken')
    await expect(new ManualControl(f.control.path, f.bridge).initialize()).rejects.toMatchObject({ code: 'journal_unavailable' })
  })
})

describe('manual owner HTTP boundary', () => {
  it('rejects guests, forged owner claims, cross-origin requests and missing mutation headers before any send', async () => {
    const f = await fixture()
    let handler!: Parameters<Parameters<typeof manualRoutes>[0]['webServer']['register']>[0]['handler']
    manualRoutes({
      webServer: { register: (route) => {
        handler = route.handler
        return () => {}
      } },
      connection: { requestRejection: req => req.headers.origin === 'https://evil.test' ? 403 : req.headers.cookie === 'owner=ok' ? undefined : 401 },
    }, f.control)
    const server = createServer((req, res) => {
      void handler(req, res)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('No test address')
    const url = `http://127.0.0.1:${address.port}/el-bot/manual/api`
    try {
      const body = JSON.stringify({ operation: 'begin', target: f.target.id, owner: 'owner' })
      const headers = { 'content-type': 'application/json', 'x-el-bot-manual': '1' }
      expect((await fetch(url, { method: 'POST', headers, body })).status).toBe(401)
      expect((await fetch(url, { method: 'POST', headers: { ...headers, cookie: 'owner=ok', origin: 'https://evil.test' }, body })).status).toBe(403)
      expect((await fetch(url, { method: 'POST', headers: { 'cookie': 'owner=ok', 'content-type': 'application/json' }, body })).status).toBe(405)
      expect(f.control.paused(f.target.id)).toBe(false)
      const response = await fetch(url, { method: 'POST', headers: { ...headers, cookie: 'owner=ok' }, body })
      expect(response.status).toBe(200)
      const result = await response.json() as { result: ManualStateView }
      expect(result.result.sessions[0].lease?.phase).toBe('active')
      expect(JSON.stringify(result)).not.toContain('peerId')
      expect(f.bridge.send).not.toHaveBeenCalled()
    }
    finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})

describe('automatic QQ policy during takeover', () => {
  it('blocks owner commands, model requests and buffered output only in the selected conversation', async () => {
    const f = await fixture()
    const policy = new QQSecurity({ appId: '123', ownerOpenId: 'owner' }, new SecurityStore(join(f.directory, 'security.json')), '/groups', f.now)
    const privateTarget = { id: policy.targetId('c2c', 'owner'), scope: 'c2c' as const, peerId: 'owner', sessionId: 'owner-session', title: '主人' }
    f.targets.push(privateTarget)
    policy.manual = f.control
    const agent = { status: 'running', session: { header: { id: 'owner-session' } }, whenIdle: async () => {} }
    const record = { sessionKey: 'qqbot:123:c2c:owner', sessionId: 'owner-session', scope: 'c2c' as const, peerId: 'owner', agent }
    const manager: SecurityManager = {
      config: { appId: '123', access: { c2cMode: 'allowlist', c2cAllow: ['owner'] } },
      sessionKey: () => record.sessionKey,
      getOrCreate: async () => record,
      remove: async () => {},
      findByAgent: value => value === agent ? record : undefined,
    }
    policy.attach(manager)
    await f.control.request({ operation: 'begin', target: privateTarget.id })
    const next = vi.fn()
    const ctx = { bot: { appId: '123' }, message: { kind: 'c2c', senderId: 'owner', messageId: 'fresh', content: '/model expensive' }, replyTarget: { scope: 'c2c', targetId: 'owner', msgId: 'fresh' }, state: {}, stop: vi.fn() } as unknown as InboundContext
    await policy.middleware(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect(policy.interaction({ id: 'paused-button', scene: 'c2c', user_openid: 'owner' })).toBe(false)
    expect(policy.guard({ agent })).toContain('manual')
    expect(policy.preStep({ agent, turn: 1, step: 1 })).toEqual({ kind: 'reject' })
    await expect(policy.request({ agent, turn: 1, step: 1 }, {})).rejects.toThrow('manual')
    expect(() => policy.outbound(ctx.replyTarget, 'late model output')).toThrow('paused')
    const lease = (await f.control.view()).sessions.find(row => row.id === privateTarget.id)!.lease!
    await f.control.request({ operation: 'end', target: privateTarget.id, lease: lease.id })
    expect(() => policy.outbound(ctx.replyTarget, 'old buffered message')).toThrow('earlier')
    expect(policy.interaction({ id: 'fresh-button', scene: 'c2c', user_openid: 'owner' })).toBe(true)
    expect(policy.outbound({ scope: 'c2c', targetId: 'owner', eventId: 'fresh-button' }, 'approval reply')).toBe('approval reply')
    ctx.message.messageId = 'new-after-end'
    ctx.replyTarget.msgId = 'new-after-end'
    await policy.middleware(ctx, next)
    expect(next).toHaveBeenCalledOnce()
    expect(policy.outbound(ctx.replyTarget, 'new automatic response')).toBe('new automatic response')
  })
})

it('can retry an incomplete pause without creating a new lease or resuming automatic output', async () => {
  const f = await fixture()
  vi.mocked(f.bridge.drain).mockRejectedValueOnce(new Error('timeout'))
  await expect(f.begin()).rejects.toThrow('still_pausing')
  const lease = (await f.control.view()).sessions[0].lease!
  expect(lease.phase).toBe('pausing')
  await f.control.request({ operation: 'begin', target: f.target.id })
  expect((await f.control.view()).sessions[0].lease).toMatchObject({ id: lease.id, phase: 'active' })
  expect(f.control.paused(f.target.id)).toBe(true)
  expect(f.bridge.drain).toHaveBeenCalledTimes(2)
})

it('never releases a message received during handoff into automatic output when recording outlasts the lease', async () => {
  const f = await fixture()
  await f.begin(30)
  f.advance(31_000)
  f.control.observe(f.target.id, 'arrived-while-paused', 'recorded after expiry', true, true)
  expect(f.control.automaticAllowed(f.target.id, 'arrived-while-paused')).toBe(false)
  f.control.observe(f.target.id, 'genuinely-new', 'arrived after expiry', true)
  expect(f.control.automaticAllowed(f.target.id, 'genuinely-new')).toBe(true)
})
