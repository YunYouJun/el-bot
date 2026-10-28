import type { RawData } from 'ws'
import type { WecomBridgeOptions, WecomInboundPayload } from './types'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { inspectWecomMessage, isWecomDisconnect } from './normalize'
import { WECOM_DEFAULT_WS_URL } from './types'
import { isRecord } from './util'
import { postWecomWebhook } from './webhook'

const MAX_RECONNECT_DELAY_MS = 30_000
const SEEN_LIMIT = 1000

function rawText(data: RawData): string {
  if (typeof data === 'string')
    return data
  if (Array.isArray(data))
    return Buffer.concat(data).toString('utf8')
  if (Buffer.isBuffer(data))
    return data.toString('utf8')
  return Buffer.from(new Uint8Array(data)).toString('utf8')
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * WeCom 智能机器人 long connection.
 * Subscribes with Bot ID + Secret, heartbeats, and forwards inbound text to the webhook.
 */
export class WecomBridge {
  private socket?: WebSocket
  private heartbeat?: ReturnType<typeof setInterval>
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private subscribeTimer?: ReturnType<typeof setTimeout>
  private stopped = true
  private authenticated = false
  private attempt = 0
  private generation = 0
  private sawInbound = false
  private subscribeReqId?: string
  private readonly seen = new Set<string>()

  constructor(private readonly options: WecomBridgeOptions) {
    if (!options.botId || !options.secret)
      throw new Error('WeCom bot id and secret are required')
    if (!options.webhookUrl)
      throw new Error('WeCom webhook URL is required')
    if (!options.webhookAuthValue)
      throw new Error('WeCom webhook auth value is required')
    if ((options.heartbeatIntervalMs ?? 30_000) <= 0)
      throw new Error('heartbeatIntervalMs must be positive')
  }

  start() {
    if (!this.stopped)
      return
    this.stopped = false
    this.attempt = 0
    this.connect()
  }

  stop() {
    this.stopped = true
    this.clearTimers()
    this.authenticated = false
    const socket = this.socket
    this.socket = undefined
    socket?.close()
  }

  private connect() {
    const generation = ++this.generation
    let socket: WebSocket
    try {
      socket = new WebSocket(this.options.wsUrl ?? WECOM_DEFAULT_WS_URL, {
        handshakeTimeout: 15_000,
        maxPayload: 1024 * 1024,
      })
    }
    catch (error) {
      this.fail(error instanceof Error ? error : new Error('WeCom websocket connection failed'))
      this.scheduleReconnect()
      return
    }

    this.socket = socket
    this.authenticated = false
    socket.on('open', () => {
      if (socket !== this.socket || this.stopped)
        return
      this.sendSubscribe(socket)
    })
    socket.on('message', (data) => {
      if (generation !== this.generation || socket !== this.socket || this.stopped)
        return
      this.sawInbound = true
      this.receive(socket, data)
    })
    socket.on('error', () => {
      if (generation !== this.generation || this.stopped)
        return
      this.fail(new Error('WeCom websocket connection failed'))
    })
    socket.once('close', () => {
      if (socket !== this.socket)
        return
      this.clearTimers()
      this.authenticated = false
      if (this.stopped)
        return
      this.options.onDisconnect?.()
      this.scheduleReconnect()
    })
  }

  private sendSubscribe(socket: WebSocket) {
    const reqId = randomUUID()
    this.subscribeReqId = reqId
    clearTimeout(this.subscribeTimer)
    this.subscribeTimer = setTimeout(() => {
      if (socket !== this.socket || this.stopped)
        return
      this.fail(new Error('WeCom subscribe timed out'))
      socket.terminate()
    }, this.options.subscribeTimeoutMs ?? 10_000)
    socket.send(JSON.stringify({
      cmd: 'aibot_subscribe',
      headers: { req_id: reqId },
      body: {
        bot_id: this.options.botId,
        secret: this.options.secret,
      },
    }))
  }

  private receive(socket: WebSocket, data: RawData) {
    let frame: unknown
    try {
      frame = JSON.parse(rawText(data))
    }
    catch {
      this.fail(new Error('Invalid WeCom websocket message'))
      return
    }
    if (!isRecord(frame))
      return

    const reqId = isRecord(frame.headers) && typeof frame.headers.req_id === 'string'
      ? frame.headers.req_id
      : undefined
    if (reqId && reqId === this.subscribeReqId && typeof frame.errcode === 'number') {
      clearTimeout(this.subscribeTimer)
      if (frame.errcode === 0) {
        this.authenticated = true
        this.attempt = 0
        this.startHeartbeat(socket)
        this.options.onReady?.()
      }
      else {
        const errmsg = typeof frame.errmsg === 'string' ? frame.errmsg.slice(0, 200) : ''
        this.fail(new Error(`WeCom subscribe failed: ${frame.errcode}${errmsg ? ` ${errmsg}` : ''}`))
        socket.close()
      }
      return
    }

    if (!this.authenticated)
      return
    if (isWecomDisconnect(frame)) {
      this.fail(new Error('WeCom connection superseded by a newer subscription'))
      return
    }

    const decision = inspectWecomMessage(frame)
    if (decision.action === 'ignore') {
      this.options.onIgnored?.(decision.ignored)
      return
    }
    if (decision.action !== 'forward')
      return
    if (this.seen.has(decision.payload.msg.id))
      return
    this.remember(decision.payload.msg.id)
    void this.deliver(decision.payload)
  }

  private async deliver(payload: WecomInboundPayload) {
    const retries = this.options.webhookRetries ?? 2
    const retryDelayMs = this.options.webhookRetryDelayMs ?? 200
    let last: unknown
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (this.stopped)
        return
      try {
        await postWecomWebhook({
          url: this.options.webhookUrl,
          payload,
          authHeader: this.options.webhookAuthHeader ?? 'Authorization',
          authValue: this.options.webhookAuthValue,
          fetchImpl: this.options.fetchImpl,
          timeoutMs: this.options.webhookTimeoutMs,
        })
        if (!this.stopped)
          this.options.onInbound?.(payload)
        return
      }
      catch (error) {
        last = error
        if (attempt < retries)
          await delay(retryDelayMs)
      }
    }
    this.seen.delete(payload.msg.id)
    const message = last instanceof Error ? last.message : 'Grok webhook request failed'
    this.fail(new Error(`Failed to forward ${payload.msg.id}: ${message}`))
  }

  private startHeartbeat(socket: WebSocket) {
    clearInterval(this.heartbeat)
    this.sawInbound = true
    this.heartbeat = setInterval(() => {
      if (socket !== this.socket || socket.readyState !== WebSocket.OPEN)
        return
      if (!this.sawInbound) {
        socket.terminate()
        return
      }
      this.sawInbound = false
      try {
        socket.send(JSON.stringify({
          cmd: 'ping',
          headers: { req_id: randomUUID() },
        }))
      }
      catch {
        socket.terminate()
      }
    }, this.options.heartbeatIntervalMs ?? 30_000)
  }

  private remember(id: string) {
    this.seen.add(id)
    if (this.seen.size <= SEEN_LIMIT)
      return
    const oldest = this.seen.values().next().value
    if (oldest !== undefined)
      this.seen.delete(oldest)
  }

  private scheduleReconnect() {
    if (this.stopped)
      return
    const max = this.options.maxReconnectAttempts ?? -1
    if (max !== -1 && this.attempt >= max) {
      this.fail(new Error('WeCom reconnect attempts exhausted'))
      return
    }
    const base = this.options.reconnectBaseMs ?? 1000
    const wait = Math.min(MAX_RECONNECT_DELAY_MS, base * 2 ** this.attempt)
    this.attempt += 1
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      if (!this.stopped)
        this.connect()
    }, wait)
  }

  private clearTimers() {
    clearInterval(this.heartbeat)
    clearTimeout(this.subscribeTimer)
    clearTimeout(this.reconnectTimer)
    this.heartbeat = undefined
    this.subscribeTimer = undefined
    this.reconnectTimer = undefined
  }

  private fail(error: Error) {
    this.options.onError?.(error)
  }
}
