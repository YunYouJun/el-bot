import type { ClientHttp2Session } from 'node:http2'
import { Buffer } from 'node:buffer'
import { createPrivateKey, randomUUID, sign } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { connect } from 'node:http2'

export interface PushNotification {
  token: string
  environment: 'sandbox' | 'production'
  sessionId: string
  origin: string
  title: string
  text: string
  id: string
}
export interface PushReceipt { status: 'accepted' | 'rejected' | 'unknown', id: string, code?: string }
export type PushSender = (notification: PushNotification) => Promise<PushReceipt>
interface ApnsKey { keyId: string, keyFile: string }
export interface ApnsConfig extends ApnsKey { teamId: string, topic: string, sandbox?: ApnsKey }

/** APNs acceptance is a provider receipt, not proof that the phone displayed an alert. */
export async function apnsSender(config: ApnsConfig, open: (origin: string) => ClientHttp2Session = connect): Promise<PushSender> {
  if (!/^[A-Z0-9]{10}$/.test(config.teamId) || !/^[\w.-]{3,200}$/.test(config.topic)) {
    throw new Error('Invalid APNs provider configuration')
  }
  const loadKey = async (value: ApnsKey) => {
    if (!/^[A-Z0-9]{10}$/.test(value.keyId))
      throw new Error('Invalid APNs key ID')
    const key = createPrivateKey(await readFile(value.keyFile))
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
      throw new Error('APNs requires a P-256 signing key')
    return { keyId: value.keyId, key, jwt: undefined as { token: string, at: number } | undefined }
  }
  const production = await loadKey(config)
  const sandbox = config.sandbox ? await loadKey(config.sandbox) : production
  return async (notification) => {
    const id = notification.id || randomUUID()
    const now = Math.floor(Date.now() / 1000)
    const credential = notification.environment === 'sandbox' ? sandbox : production
    if (!credential.jwt || now - credential.jwt.at >= 40 * 60 || now < credential.jwt.at) {
      const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: credential.keyId })).toString('base64url')
      const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: now })).toString('base64url')
      const payload = `${header}.${claims}`
      credential.jwt = { token: `${payload}.${sign('sha256', Buffer.from(payload), { key: credential.key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`, at: now }
    }
    return new Promise<PushReceipt>((resolve) => {
      let client: ClientHttp2Session | undefined
      let done = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (receipt: PushReceipt) => {
        if (done)
          return
        done = true
        clearTimeout(timer)
        client?.destroy()
        resolve(receipt)
      }
      timer = setTimeout(finish, 8000, { status: 'unknown', id, code: 'timeout' })
      try {
        client = open(notification.environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com')
        client.on('error', () => finish({ status: 'unknown', id, code: 'connection_error' }))
        const request = client.request({
          ':method': 'POST',
          ':path': `/3/device/${notification.token}`,
          'authorization': `bearer ${credential.jwt!.token}`,
          'apns-topic': config.topic,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'apns-expiration': String(now + 3600),
          'apns-id': id,
          'apns-collapse-id': id,
          'content-type': 'application/json',
        })
        let status = 0
        let response = ''
        request.on('response', (headers) => {
          status = Number(headers[':status'])
        })
        request.setEncoding('utf8')
        request.on('data', (chunk: string) => {
          response += chunk
          if (response.length > 4096)
            finish({ status: 'unknown', id, code: 'invalid_response' })
        })
        request.on('error', () => finish({ status: 'unknown', id, code: 'stream_error' }))
        request.on('end', () => {
          if (status === 200) {
            finish({ status: 'accepted', id })
            return
          }
          let code = `http_${status}`
          try {
            const body: { reason?: unknown } = JSON.parse(response)
            if (typeof body.reason === 'string' && /^[A-Z]{1,80}$/i.test(body.reason))
              code = body.reason
          }
          catch { /* Only bounded platform codes belong in receipts. */ }
          finish({ status: status ? 'rejected' : 'unknown', id, code })
        })
        request.end(JSON.stringify({
          aps: { 'alert': { title: notification.title.slice(0, 80), body: notification.text.slice(0, 400) }, 'sound': 'default', 'thread-id': notification.sessionId },
          sessionId: notification.sessionId,
          origin: notification.origin,
        }))
      }
      catch { finish({ status: 'unknown', id, code: 'connection_error' }) }
    })
  }
}
