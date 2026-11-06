import type { Server } from 'node:http'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { expect, it } from 'vitest'
import { createMobileProxy } from './proxy'

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing test listener')
  return `http://127.0.0.1:${address.port}`
}

it('forwards only mobile API paths and preserves the device credential and prompt body', async () => {
  let calls = 0
  const host = createServer(async (req, res) => {
    calls++
    const chunks = []
    for await (const chunk of req)
      chunks.push(chunk)
    res.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ authorization: req.headers.authorization, body: Buffer.concat(chunks).toString(), url: req.url }))
  })
  const upstream = await listen(host)
  const proxy = createMobileProxy(upstream)
  const url = await listen(proxy)
  try {
    expect((await fetch(`${url}/`)).status).toBe(404)
    expect((await fetch(`${url}/api/typert`)).status).toBe(404)
    expect(calls).toBe(0)
    const response = await fetch(`${url}/el-bot/mobile/v1/sessions/example/messages`, { method: 'POST', headers: { 'authorization': 'Bearer test-device-credential', 'content-type': 'application/json' }, body: '{"text":"continue","requestId":"same-id"}' })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ authorization: 'Bearer test-device-credential', body: '{"text":"continue","requestId":"same-id"}', url: '/el-bot/mobile/v1/sessions/example/messages' })
    expect(calls).toBe(1)
  }
  finally {
    for (const server of [proxy, host]) {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }
})
