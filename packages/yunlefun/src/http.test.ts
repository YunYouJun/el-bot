import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { routes } from './http'
import { DEFAULT_RUNTIME_ORIGIN } from './protocol'
import { YunlefunService } from './service'
import { AccountStore } from './store'

describe('yunLeFun owner settings routes', () => {
  it('requires instance authentication and same-origin mutation, including SSH loopback origins', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'el-bot-yunlefun-http-'))
    const store = new AccountStore(join(directory, 'account.json'))
    await store.load()
    const service = new YunlefunService(store, DEFAULT_RUNTIME_ORIGIN)
    const server = createServer(routes(service, req => req.headers.authorization === 'Bearer test-owner' ? undefined : 401, 'https://bot.yunle.fun', () => {}, 'http://172.18.0.7:3080'))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing test address')
    const origin = `http://127.0.0.1:${address.port}`
    const headers = { 'authorization': 'Bearer test-owner', 'content-type': 'application/json', 'x-el-bot-ai': '1' }
    try {
      expect((await fetch(`${origin}/el-bot/ai/`)).status).toBe(401)
      const denied = await fetch(`${origin}/el-bot/ai/api`, { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body: '{"action":"status"}' })
      expect(denied.status).toBe(403)
      const local = await fetch(`${origin}/el-bot/ai/api`, { method: 'POST', headers: { ...headers, origin }, body: '{"action":"status"}' })
      expect(local.status).toBe(200)
      const status = await local.json()
      expect(status).toMatchObject({ authorized: false, tasks: [] })
      expect(status).not.toHaveProperty('key')
      expect(status).not.toHaveProperty('authorization')
      const gatewayStatus = (transportOrigin: string) => new Promise<number>((resolve, reject) => {
        const req = request(`${origin}/el-bot/ai/api`, { method: 'POST', headers: { ...headers, origin: transportOrigin, host: new URL(transportOrigin).host } }, (res) => {
          res.resume()
          resolve(res.statusCode!)
        })
        req.on('error', reject)
        req.end('{"action":"status"}')
      })
      expect(await gatewayStatus('http://172.18.0.7:3080')).toBe(200)
      expect(await gatewayStatus('http://172.18.0.8:3080')).toBe(403)
      expect((await fetch(`${origin}/el-bot/ai/api`, { headers })).status).toBe(403)
    }
    finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(directory, { recursive: true, force: true })
    }
  })
})
