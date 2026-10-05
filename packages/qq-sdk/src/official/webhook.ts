import type { C2CMessage } from './types'
import { Buffer } from 'node:buffer'
import nacl from 'tweetnacl'
import { generateSeed } from '../validation'
import { isRecord } from './client'
import { parseC2CMessage } from './gateway'

/** Verify the exact HTTP body before decoding or dispatching any event. */
export function createQQWebhookHandler(options: {
  appId: string
  secret: string
  onMessage: (message: C2CMessage) => Promise<void>
}) {
  const keys = nacl.sign.keyPair.fromSeed(generateSeed(options.secret))
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST')
      return new Response('Method not allowed', { status: 405 })
    if (request.headers.get('x-bot-appid') !== options.appId)
      return new Response('Unauthorized', { status: 401 })
    const timestamp = request.headers.get('x-signature-timestamp') ?? ''
    const signature = request.headers.get('x-signature-ed25519') ?? ''
    if (
      !/^\d{10}$/.test(timestamp)
      || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
      || !/^[a-f\d]{128}$/i.test(signature)
    ) {
      return new Response('Unauthorized', { status: 401 })
    }
    const body = await request.text()
    if (Buffer.byteLength(body) > 1024 * 1024)
      return new Response('Payload too large', { status: 413 })
    if (
      !nacl.sign.detached.verify(
        Buffer.from(timestamp + body),
        Buffer.from(signature, 'hex'),
        keys.publicKey,
      )
    ) {
      return new Response('Unauthorized', { status: 401 })
    }
    try {
      const payload: unknown = JSON.parse(body)
      if (
        isRecord(payload)
        && payload.op === 13
        && isRecord(payload.d)
        && typeof payload.d.plain_token === 'string'
        && typeof payload.d.event_ts === 'string'
      ) {
        const signed = nacl.sign.detached(
          Buffer.from(payload.d.event_ts + payload.d.plain_token),
          keys.secretKey,
        )
        return Response.json({
          plain_token: payload.d.plain_token,
          signature: Buffer.from(signed).toString('hex'),
        })
      }
      const message = parseC2CMessage(payload)
      if (message)
        await options.onMessage(message)
      return Response.json({ op: 12 })
    }
    catch {
      return new Response('Dispatch failed', { status: 500 })
    }
  }
}
