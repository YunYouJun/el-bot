import type { IncomingHttpHeaders, ServerHttp2Stream } from 'node:http2'
import { Buffer } from 'node:buffer'
import { generateKeyPairSync, verify } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { connect, createServer } from 'node:http2'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { apnsSender } from './apns'

it('sends signed HTTP/2 alert requests and distinguishes APNs acceptance from rejection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yun-apns-'))
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const keyFile = join(directory, 'fixture.p8')
  await writeFile(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  const sandbox = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const sandboxKeyFile = join(directory, 'sandbox.p8')
  await writeFile(sandboxKeyFile, sandbox.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  const server = createServer()
  const requests: { headers: Record<string, unknown>, payload: string }[] = []
  server.on('stream', (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) => {
    let payload = ''
    stream.on('data', (chunk) => {
      payload += chunk
    })
    stream.on('end', () => {
      requests.push({ headers, payload })
      stream.respond({ ':status': requests.length === 1 ? 200 : 410 })
      stream.end(requests.length === 1 ? '' : JSON.stringify({ reason: 'Unregistered' }))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No APNs fixture address')
  const origins: string[] = []
  try {
    const send = await apnsSender({ teamId: 'TEAM123456', keyId: 'KEY1234567', topic: 'fun.yunle.bot', keyFile, sandbox: { keyId: 'SBOX123456', keyFile: sandboxKeyFile } }, (origin) => {
      origins.push(origin)
      return connect(`http://127.0.0.1:${address.port}`)
    })
    const notification = { id: '18332962-f04e-40b0-8281-bd10396a9b14', token: 'ab'.repeat(32), environment: 'sandbox' as const, title: '提醒', text: '该去看牙了', sessionId: 'owner-session', origin: 'https://bot.test' }
    expect(await send(notification)).toMatchObject({ status: 'accepted', id: notification.id })
    expect(await send({ ...notification, environment: 'production' })).toMatchObject({ status: 'rejected', code: 'Unregistered' })
    expect(origins).toEqual(['https://api.sandbox.push.apple.com', 'https://api.push.apple.com'])
    expect(requests[0].headers).toMatchObject({ ':method': 'POST', ':path': `/3/device/${notification.token}`, 'apns-topic': 'fun.yunle.bot', 'apns-push-type': 'alert', 'apns-priority': '10' })
    const jwt = String(requests[0].headers.authorization).slice('bearer '.length).split('.')
    expect(JSON.parse(Buffer.from(jwt[0], 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'SBOX123456' })
    expect(verify('sha256', Buffer.from(`${jwt[0]}.${jwt[1]}`), { key: sandbox.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(jwt[2], 'base64url'))).toBe(true)
    const productionJwt = String(requests[1].headers.authorization).slice('bearer '.length).split('.')
    expect(JSON.parse(Buffer.from(productionJwt[0], 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567' })
    expect(verify('sha256', Buffer.from(`${productionJwt[0]}.${productionJwt[1]}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(productionJwt[2], 'base64url'))).toBe(true)
    expect(JSON.parse(requests[0].payload)).toMatchObject({ aps: { alert: { body: '该去看牙了' }, sound: 'default' }, sessionId: 'owner-session', origin: 'https://bot.test' })
  }
  finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})
