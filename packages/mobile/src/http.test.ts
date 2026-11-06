import type { MobileHost } from './types'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { DeviceStore } from './auth'
import { API_PATH, mobileRoutes } from './http'

it('gates cloud operations behind pairing, preserves prompt identity and revokes access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-bot-mobile-http-'))
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const pairing = await devices.createPairing()
  const session = { id: 'existing-session', title: 'Existing chat', running: false, updatedAt: new Date().toISOString() }
  const host: MobileHost = {
    list: vi.fn(async () => [session]),
    conversation: vi.fn(async () => ({ session, messages: [], cursor: 0, hasMore: false })),
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
    expect(host.list).not.toHaveBeenCalled()
    const paired = await fetch(`${url}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: pairing.code, deviceName: 'iPhone' }) })
    expect(paired.status).toBe(200)
    const { token } = await paired.json() as { token: string }
    const headers = { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }
    expect((await fetch(`${url}/sessions`, { headers })).status).toBe(200)
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
