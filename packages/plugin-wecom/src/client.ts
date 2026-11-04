import type { WsFrame } from '@wecom/aibot-node-sdk'
import type { WecomBridgeOptions, WecomInboundPayload } from './types'
import { WSClient } from '@wecom/aibot-node-sdk'
import { WecomApiError } from './errors'
import { inspectWecomMessage } from './normalize'
import { replyOnWecom } from './reply'
import { postWecomWebhook } from './webhook'

const SEEN_LIMIT = 1000

/** Normalize messages and optional forwarding; the official SDK owns the connection. */
export class WecomBridge {
  private readonly client: WSClient
  private readonly seen = new Set<string>()
  private stopped = true
  private authenticated = false
  private subscribeTimer?: ReturnType<typeof setTimeout>

  constructor(private readonly options: WecomBridgeOptions) {
    if (!options.botId || !options.secret)
      throw new Error('WeCom bot id and secret are required')
    if (options.webhookUrl && !options.webhookAuthValue)
      throw new Error('WeCom forwarding webhook auth value is required')
    if ((options.heartbeatIntervalMs ?? 30_000) <= 0)
      throw new Error('heartbeatIntervalMs must be positive')
    this.client = new WSClient({
      botId: options.botId,
      secret: options.secret,
      wsUrl: options.wsUrl,
      heartbeatInterval: options.heartbeatIntervalMs ?? 30_000,
      reconnectInterval: options.reconnectBaseMs ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? -1,
      maxAuthFailureAttempts: 1,
      requestTimeout: options.subscribeTimeoutMs ?? 10_000,
      // SDK debug logs include raw message bodies; keep logging at our normalized seam.
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    })
    this.client.on('authenticated', () => {
      if (this.stopped)
        return
      clearTimeout(this.subscribeTimer)
      this.authenticated = true
      options.onReady?.()
    })
    this.client.on('disconnected', () => {
      this.authenticated = false
      if (!this.stopped)
        options.onDisconnect?.()
    })
    this.client.on('error', () => this.fail(new Error('WeCom connection or authentication failed')))
    this.client.on('event.disconnected_event', () => this.fail(new Error('WeCom connection superseded by a newer subscription')))
    this.client.on('message', (frame) => {
      if (this.stopped || !this.authenticated)
        return
      const decision = inspectWecomMessage(frame)
      if (decision.action === 'ignore') {
        options.onIgnored?.(decision.ignored)
        return
      }
      if (decision.action !== 'forward' || this.seen.has(decision.payload.msg.id))
        return
      this.seen.add(decision.payload.msg.id)
      if (this.seen.size > SEEN_LIMIT) {
        const oldest = this.seen.values().next().value
        if (oldest !== undefined)
          this.seen.delete(oldest)
      }
      void this.deliver(decision.payload, frame)
    })
  }

  start() {
    if (!this.stopped)
      return
    this.stopped = false
    this.subscribeTimer = setTimeout(() => {
      this.fail(new Error('WeCom subscribe timed out'))
      this.stop()
    }, this.options.subscribeTimeoutMs ?? 10_000)
    this.client.connect()
  }

  stop() {
    this.stopped = true
    this.authenticated = false
    clearTimeout(this.subscribeTimer)
    this.client.disconnect()
  }

  async sendMessage(target: string, content: string): Promise<unknown> {
    if (this.stopped || !this.authenticated)
      throw new Error('WeCom smart bot is not authenticated')
    try {
      return await this.client.sendMessage(target, { msgtype: 'markdown', markdown: { content } })
    }
    catch (error) {
      throw new WecomApiError('send', error)
    }
  }

  private async deliver(payload: WecomInboundPayload, frame: WsFrame) {
    try {
      if (this.options.webhookUrl)
        await this.forward(payload, this.options.webhookUrl)
      if (this.stopped)
        return
      await this.options.onInbound?.(payload)
      await this.options.onMessage?.(payload, {
        reply: content => replyOnWecom(this.client, frame, content),
      })
    }
    catch (error) {
      this.seen.delete(payload.msg.id)
      const forwarding = this.options.webhookUrl
      const detail = forwarding && error instanceof Error && /^Grok webhook responded \d+$/u.test(error.message) ? `: ${error.message}` : ''
      this.fail(new Error(`Failed to ${forwarding ? 'forward' : 'handle'} ${payload.msg.id}${detail}`))
    }
  }

  private async forward(payload: WecomInboundPayload, url: string) {
    const retries = this.options.webhookRetries ?? 2
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (this.stopped)
        return
      try {
        await postWecomWebhook({
          url,
          payload,
          authHeader: this.options.webhookAuthHeader ?? 'Authorization',
          authValue: this.options.webhookAuthValue!,
          fetchImpl: this.options.fetchImpl,
          timeoutMs: this.options.webhookTimeoutMs,
        })
        return
      }
      catch (error) {
        if (attempt === retries)
          throw error
        await new Promise(resolve => setTimeout(resolve, this.options.webhookRetryDelayMs ?? 200))
      }
    }
  }

  private fail(error: Error) {
    if (!this.stopped)
      this.options.onError?.(error)
  }
}
