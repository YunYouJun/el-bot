import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

export interface GrokResponderOptions {
  webhookUrl: string
  authValue: string
  authHeader?: string
  callbackUrl: string
  /** Use only when the SDK bridge and the Grok routine share one computer. */
  callbackMode?: 'https' | 'loopback'
  timeoutMs?: number
  fetchImpl?: typeof fetch
  onSent?: () => void
}

export class GrokAnswerError extends Error {
  constructor(readonly code: 'GROK_TIMEOUT' | 'GROK_CANCELLED' | 'GROK_WEBHOOK_REJECTED' | 'GROK_REQUEST_FAILED') {
    super(code)
    this.name = 'GrokAnswerError'
  }
}

interface PendingAnswer {
  requestId: string
  resolve: (answer: string) => void
}

/** Official webhook starts the run; a one-use capability binds the asynchronous answer. */
export class GrokWebhookResponder {
  private readonly pending = new Map<string, PendingAnswer>()

  constructor(private readonly options: GrokResponderOptions) {
    for (const address of [options.webhookUrl, options.callbackUrl]) {
      const url = new URL(address)
      if (url.username || url.password || url.hash)
        throw new Error('Grok addresses must not contain credentials or fragments')
    }
    if (new URL(options.webhookUrl).protocol !== 'https:')
      throw new Error('Grok webhook must use HTTPS')
    const callback = new URL(options.callbackUrl)
    if (options.callbackMode === 'loopback') {
      if (callback.protocol !== 'http:' || callback.hostname !== '127.0.0.1')
        throw new Error('Loopback callbacks must use HTTP on 127.0.0.1')
    }
    else if (callback.protocol !== 'https:') {
      throw new Error('Grok callback must use HTTPS unless loopback mode is explicit')
    }
    if (!options.authValue || (options.timeoutMs ?? 240_000) <= 0)
      throw new Error('Grok webhook authentication and a positive timeout are required')
  }

  async ask(question: string, signal?: AbortSignal): Promise<string> {
    if (!question.trim())
      throw new Error('A non-empty question is required')
    if (signal?.aborted)
      throw new GrokAnswerError('GROK_CANCELLED')
    const requestId = randomUUID()
    const token = randomBytes(32).toString('hex')
    const key = createHash('sha256').update(token).digest('hex')
    const control = new AbortController()
    const combined = signal ? AbortSignal.any([signal, control.signal]) : control.signal
    let receive!: (answer: string) => void
    const answer = new Promise<string>((resolve) => {
      receive = resolve
    })
    this.pending.set(key, { requestId, resolve: receive })
    let rejectAbort!: () => void
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(new GrokAnswerError(signal?.aborted ? 'GROK_CANCELLED' : 'GROK_TIMEOUT'))
      combined.addEventListener('abort', rejectAbort, { once: true })
    })
    const timer = setTimeout(() => control.abort(), this.options.timeoutMs ?? 240_000)
    const run = async () => {
      const response = await (this.options.fetchImpl ?? fetch)(this.options.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [this.options.authHeader ?? 'Authorization']: this.options.authValue },
        body: JSON.stringify({ version: 1, requestId, text: question, reply: { url: this.options.callbackUrl, authorization: `Bearer ${token}` } }),
        redirect: 'error',
        signal: combined,
      })
      await response.body?.cancel()
      if (!response.ok)
        throw new GrokAnswerError('GROK_WEBHOOK_REJECTED')
      this.options.onSent?.()
      return await answer
    }
    try {
      return await Promise.race([run(), cancelled])
    }
    catch (error) {
      throw error instanceof GrokAnswerError ? error : new GrokAnswerError('GROK_REQUEST_FAILED')
    }
    finally {
      clearTimeout(timer)
      this.pending.delete(key)
      combined.removeEventListener('abort', rejectAbort)
      control.abort()
    }
  }

  async handleRequest(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== new URL(this.options.callbackUrl).pathname)
      return new Response(null, { status: 404 })
    if (request.method !== 'POST')
      return new Response(null, { status: 405 })
    const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/u)?.[1]
    if (!token)
      return new Response(null, { status: 401 })
    const key = createHash('sha256').update(token).digest('hex')
    const pending = this.pending.get(key)
    if (!pending)
      return new Response(null, { status: 401 })
    const reader = request.body?.getReader()
    if (!reader)
      return new Response(null, { status: 400 })
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done)
          break
        size += chunk.value.byteLength
        if (size > 65_536) {
          await reader.cancel()
          return new Response(null, { status: 413 })
        }
        chunks.push(chunk.value)
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (typeof body !== 'object' || body === null || !('requestId' in body) || body.requestId !== pending.requestId
        || !('answer' in body) || typeof body.answer !== 'string' || !body.answer.trim()) {
        return new Response(null, { status: 400 })
      }
      // A timeout or another callback may have consumed this capability while reading.
      if (this.pending.get(key) !== pending)
        return new Response(null, { status: 401 })
      this.pending.delete(key)
      pending.resolve(body.answer.trim())
      return new Response(null, { status: 204 })
    }
    catch {
      return new Response(null, { status: 400 })
    }
    finally {
      reader.releaseLock()
    }
  }
}
