import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { DeviceStore } from './auth'
import { API_PATH, mobileRoutes } from './http'
import { PhoneRelay } from './phone'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse())
    await cleanup()
})

async function setup() {
  let now = Date.now()
  const directory = await mkdtemp(join(tmpdir(), 'yun-phone-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  const devices = new DeviceStore(join(directory, 'devices.json'), () => now)
  await devices.load()
  const pair = async () => {
    const { code } = await devices.createPairing()
    return devices.exchange(code, 'iPhone')
  }
  const device = await pair()
  const create = vi.fn(async (requestId: string) => `session-${requestId}`.slice(0, 128))
  const relay = new PhoneRelay(devices, { create }, () => now)
  cleanups.push(async () => relay.close())
  const channel = await relay.open(device.device.id, 'request', ['chrome']) as { channel: string, sessionId: string, expiresAt: string }
  return { relay, devices, device, channel, create, pair, advance: (ms: number) => {
    now += ms
  } }
}

it('binds tools to the locally armed session and never redelivers claimed actions', async () => {
  const { relay, device, channel, create } = await setup()
  const signal = new AbortController().signal
  await expect(relay.execute('another-session', 'call', { app: 'chrome' }, signal)).rejects.toThrow('not locally armed')
  await expect(relay.execute(channel.sessionId, 'call', { app: 'settings' }, signal)).rejects.toThrow('not locally allowed')
  const execution = relay.execute(channel.sessionId, 'call', { app: 'chrome' }, signal)
  const { command } = relay.next(device.device.id, channel.channel)
  expect(command).toMatchObject({ app: 'chrome', returnToYun: true, sessionId: channel.sessionId })
  expect(relay.next(device.device.id, channel.channel).command).toBeNull()
  const receipt = { id: command!.id, status: 'succeeded', launched: true, returnedToYun: true }
  relay.complete(device.device.id, channel.channel, receipt)
  relay.complete(device.device.id, channel.channel, receipt)
  await expect(execution).resolves.toMatchObject({ status: 'succeeded', app: 'chrome' })
  await expect(relay.execute(channel.sessionId, 'call', { app: 'chrome' }, signal)).resolves.toMatchObject({ status: 'succeeded' })
  expect(relay.next(device.device.id, channel.channel).command).toBeNull()
  await expect(relay.open(device.device.id, 'request', ['chrome'])).resolves.toEqual(channelWithApps(channel))
  expect(create).toHaveBeenCalledTimes(1)
})

function channelWithApps(channel: object) {
  return { ...channel, apps: ['chrome'] }
}

it('rejects another device, missing capabilities, invalid receipts and rotated leases', async () => {
  const { relay, device, channel, pair } = await setup()
  const other = await pair()
  expect(() => relay.next(other.device.id, channel.channel)).toThrow('phone_channel_inactive')
  expect(() => relay.next(device.device.id, undefined)).toThrow('phone_channel_inactive')
  expect(() => relay.next(device.device.id, '中'.repeat(43))).toThrow('phone_channel_inactive')
  const execution = relay.execute(channel.sessionId, 'call', { app: 'chrome' }, new AbortController().signal)
  const { command } = relay.next(device.device.id, channel.channel)
  expect(() => relay.complete(device.device.id, channel.channel, { id: command!.id, status: 'succeeded', launched: false, returnedToYun: true })).toThrow('invalid_phone_receipt')
  await relay.open(device.device.id, 'rotated', ['chrome'])
  expect(() => relay.next(device.device.id, channel.channel)).toThrow('phone_channel_inactive')
  await expect(execution).resolves.toMatchObject({ status: 'unknown' })
})

it('expires, revokes and cancels queued work; a claimed timeout stays unknown', async () => {
  const { relay, device, channel, devices, advance } = await setup()
  const cancel = new AbortController()
  const queued = relay.execute(channel.sessionId, 'queued', { app: 'chrome' }, cancel.signal)
  cancel.abort()
  await expect(queued).resolves.toMatchObject({ status: 'failed' })
  expect(relay.next(device.device.id, channel.channel).command).toBeNull()
  const claimed = relay.execute(channel.sessionId, 'claimed', { app: 'chrome' }, new AbortController().signal)
  relay.next(device.device.id, channel.channel)
  advance(21_000)
  expect(relay.next(device.device.id, channel.channel).command).toBeNull()
  await expect(claimed).resolves.toMatchObject({ status: 'unknown' })
  const revoked = relay.execute(channel.sessionId, 'revoked', { app: 'chrome' }, new AbortController().signal)
  await devices.revoke(device.device.id)
  expect(() => relay.next(device.device.id, channel.channel)).toThrow('phone_channel_inactive')
  await expect(revoked).resolves.toMatchObject({ status: 'failed' })
})

it('rejects offline phones and expires a local authorization without renewal', async () => {
  const { relay, device, channel, advance } = await setup()
  advance(11_000)
  await expect(relay.execute(channel.sessionId, 'offline', { app: 'chrome' }, new AbortController().signal)).rejects.toThrow('offline')
  relay.next(device.device.id, channel.channel)
  advance(600_000)
  expect(() => relay.next(device.device.id, channel.channel)).toThrow('phone_channel_inactive')
})

it('requires both native Bearer and channel capability at the HTTP boundary', async () => {
  const { relay, devices, device, channel } = await setup()
  const host = { create: vi.fn(), status: vi.fn(), list: vi.fn(), conversation: vi.fn(), models: vi.fn(), selectModel: vi.fn(), prompt: vi.fn() }
  const server = createServer(mobileRoutes(host, devices, 'https://bot.test', undefined, undefined, undefined, relay))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
  const address = server.address() as { port: number }
  const url = `http://127.0.0.1:${address.port}${API_PATH}/phone/next`
  expect((await fetch(url, { headers: { 'cookie': '__Host-yun-dsh-web=browser', 'x-yun-phone-channel': channel.channel } })).status).toBe(401)
  expect((await fetch(url, { headers: { authorization: `Bearer ${device.token}` } })).status).toBe(403)
  expect((await fetch(url, { headers: { 'authorization': `Bearer ${device.token}`, 'x-yun-phone-channel': channel.channel } })).status).toBe(200)
  expect((await fetch(url, { headers: { 'authorization': `Bearer ${device.token}`, 'x-yun-phone-channel': channel.channel, 'origin': 'https://evil.test' } })).status).toBe(403)
})
