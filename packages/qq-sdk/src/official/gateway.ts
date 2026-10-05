import type { C2CMessage, GatewayOptions, GatewayPayload } from './types'
import WebSocket from 'ws'
import { isRecord, QQApiError, QQBotClient } from './client'

export function parseC2CMessage(payload: unknown): C2CMessage | undefined {
  if (
    !isRecord(payload)
    || payload.op !== 0
    || payload.t !== 'C2C_MESSAGE_CREATE'
    || !isRecord(payload.d)
  ) {
    return
  }
  const message = payload.d
  if (
    !isRecord(message.author)
    || typeof message.author.user_openid !== 'string'
    || !message.author.user_openid
    || typeof message.id !== 'string'
    || !message.id
    || typeof message.content !== 'string'
    || typeof message.timestamp !== 'string'
    || !Number.isFinite(Date.parse(message.timestamp))
  ) {
    return
  }
  // Card/forwarded content and attachments are not executable user prompts.
  if (message.message_type !== undefined && message.message_type !== 0)
    return
  return {
    id: message.id,
    author: { user_openid: message.author.user_openid },
    content: message.content,
    timestamp: message.timestamp,
  }
}

export class QQGateway {
  private socket?: WebSocket
  private heartbeat?: ReturnType<typeof setInterval>
  private reconnect?: ReturnType<typeof setTimeout>
  private helloTimeout?: ReturnType<typeof setTimeout>
  private stopped = true
  private acknowledged = true
  private sequence: number | null = null
  private session?: string
  private failures = 0
  private dispatch = Promise.resolve()

  constructor(
    private client: QQBotClient,
    private options: GatewayOptions,
  ) {}

  async start() {
    if (!this.stopped)
      return
    this.stopped = false
    await this.connect()
  }

  private async connect() {
    try {
      const [url, token] = await Promise.all([
        this.client.gateway(),
        this.client.token(),
      ])
      if (this.stopped)
        return
      const socket = (this.socket = new WebSocket(url, {
        maxPayload: 1024 * 1024,
        handshakeTimeout: 15000,
      }))
      this.helloTimeout = setTimeout(() => socket.terminate(), 30000)
      socket.on('message', (raw) => {
        if (socket !== this.socket || this.stopped)
          return
        try {
          const data: unknown = JSON.parse(raw.toString())
          if (!isRecord(data) || typeof data.op !== 'number')
            throw new Error('Invalid QQ gateway payload')
          this.receive(data as unknown as GatewayPayload, token, socket)
        }
        catch {
          this.options.onError(new Error('Invalid QQ gateway message'))
          socket.terminate()
        }
      })
      socket.on('error', () =>
        this.options.onError(new Error('QQ gateway connection failed')))
      socket.once('close', () => {
        clearInterval(this.heartbeat)
        clearTimeout(this.helloTimeout)
        this.scheduleReconnect()
      })
    }
    catch (error) {
      this.options.onError(
        error instanceof QQApiError
          ? error
          : new Error('QQ gateway discovery or authentication failed'),
      )
      this.scheduleReconnect()
    }
  }

  private receive(payload: GatewayPayload, token: string, socket: WebSocket) {
    const send = (op: number, d: unknown) =>
      socket.send(JSON.stringify({ op, d }))
    switch (payload.op) {
      case 10: {
        if (
          !isRecord(payload.d)
          || typeof payload.d.heartbeat_interval !== 'number'
          || payload.d.heartbeat_interval < 10
        ) {
          throw new Error('Invalid heartbeat interval')
        }
        clearInterval(this.heartbeat)
        this.acknowledged = true
        this.heartbeat = setInterval(() => {
          if (!this.acknowledged) {
            socket.terminate()
            return
          }
          this.acknowledged = false
          send(1, this.sequence)
        }, payload.d.heartbeat_interval)
        if (this.session && this.sequence !== null) {
          send(6, {
            token: `QQBot ${token}`,
            session_id: this.session,
            seq: this.sequence,
          })
        }
        else {
          send(2, {
            token: `QQBot ${token}`,
            intents: 1 << 25,
            shard: [0, 1],
            properties: {},
          })
        }
        break
      }
      case 0: {
        if (
          payload.t === 'READY'
          && isRecord(payload.d)
          && typeof payload.d.session_id === 'string'
        ) {
          this.session = payload.d.session_id
        }
        if (payload.t === 'READY' || payload.t === 'RESUMED') {
          clearTimeout(this.helloTimeout)
          this.failures = 0
          this.options.onReady?.()
        }
        const message = parseC2CMessage(payload)
        this.dispatch = this.dispatch
          .then(async () => {
            if (socket !== this.socket || socket.readyState !== WebSocket.OPEN)
              return
            if (message)
              await this.options.onMessage(message)
            if (socket === this.socket && socket.readyState === WebSocket.OPEN && typeof payload.s === 'number')
              this.sequence = payload.s
          })
          .catch(() => {
            this.options.onError(new Error('QQ message dispatch failed'))
            socket.terminate()
          })
        break
      }
      case 1:
        send(1, this.sequence)
        break
      case 11:
        this.acknowledged = true
        break
      case 9:
        this.session = undefined
        this.sequence = null
        socket.terminate()
        break
      case 7:
        socket.terminate()
        break
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnect)
      return
    const delay = Math.min(
      60000,
      (this.options.reconnectMs ?? 1000) * 2 ** Math.min(this.failures++, 6),
    )
    this.reconnect = setTimeout(() => {
      this.reconnect = undefined
      void this.connect()
    }, delay)
  }

  stop() {
    this.stopped = true
    clearTimeout(this.reconnect)
    clearTimeout(this.helloTimeout)
    clearInterval(this.heartbeat)
    this.reconnect = undefined
    this.socket?.terminate()
  }
}
