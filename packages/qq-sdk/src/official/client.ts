import type { QQCredentials, QQMarkdownReply, QQMediaReply, QQUploadedMedia } from './types'
import { uploadC2CImage } from './media'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class QQApiError extends Error {
  constructor(
    public status: number,
    public code?: number,
  ) {
    super(
      `QQ API failed (HTTP ${status}${code === undefined ? '' : `, code ${code}`})${code === 11298 ? ': source IP is not in the QQ developer console allowlist' : ''}`,
    )
  }
}

/** Official v2 REST API. Tokens are cached and concurrent refreshes coalesced. */
export class QQBotClient {
  private cached?: { value: string, expiresAt: number }
  private refreshing?: Promise<string>
  readonly apiBase: string

  constructor(private credentials: QQCredentials) {
    if (!credentials.appId || !credentials.secret)
      throw new Error('QQ appId and secret are required')
    this.apiBase
      = credentials.apiBase
        ?? (credentials.sandbox
          ? 'https://sandbox.api.bot.qq.com'
          : 'https://api.bot.qq.com')
  }

  async token(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now())
      return this.cached.value
    if (this.refreshing)
      return this.refreshing
    this.refreshing = this.refreshToken()
    try {
      return await this.refreshing
    }
    finally {
      this.refreshing = undefined
    }
  }

  private async refreshToken() {
    const response = await fetch(
      this.credentials.tokenUrl
      ?? 'https://api.bot.qq.com/app/getAppAccessToken',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: this.credentials.appId,
          clientSecret: this.credentials.secret,
        }),
        signal: AbortSignal.timeout(15000),
      },
    )
    if (!response.ok)
      throw new QQApiError(response.status)
    const data: unknown = await response.json()
    if (
      !isRecord(data)
      || typeof data.access_token !== 'string'
      || !data.access_token
      || !(Number(data.expires_in) > 0)
    ) {
      throw new Error('Invalid QQ access-token response')
    }
    this.cached = {
      value: data.access_token,
      expiresAt: Date.now() + Math.max(0, Number(data.expires_in) - 60) * 1000,
    }
    return data.access_token
  }

  async request(path: string, body?: unknown): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.token()
      const response = await fetch(`${this.apiBase}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Authorization': `QQBot ${token}`,
          'Content-Type': 'application/json',
          'X-Union-Appid': this.credentials.appId,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      })
      if (response.status === 401 && attempt === 0) {
        if (this.cached?.value === token)
          this.cached = undefined
        continue
      }
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw new QQApiError(
          response.status,
          isRecord(data) && typeof data.code === 'number'
            ? data.code
            : undefined,
        )
      }
      return data
    }
    throw new Error('QQ authentication failed')
  }

  async gateway(): Promise<string> {
    const data = await this.request('/gateway')
    if (!isRecord(data) || typeof data.url !== 'string')
      throw new Error('Invalid QQ gateway response')
    const url = new URL(data.url)
    if (
      url.protocol !== 'wss:'
      && !(this.credentials.apiBase && url.protocol === 'ws:')
    ) {
      throw new Error('QQ gateway requires WSS')
    }
    return url.href
  }

  /** Upload PNG/JPEG bytes; no public file server or active message is required. */
  uploadImage(openId: string, data: Uint8Array, fileName = 'image.png'): Promise<QQUploadedMedia> {
    return uploadC2CImage((path, body) => this.request(path, body), openId, data, fileName)
  }

  /** Send a passive C2C text, Markdown or media reply with a caller-managed sequence. */
  reply(openId: string, messageId: string, content: string | QQMarkdownReply | QQMediaReply, sequence: number): Promise<unknown> {
    return this.request(`/v2/users/${encodeURIComponent(openId)}/messages`, {
      ...(typeof content === 'string'
        ? { content, msg_type: 0 }
        : 'media' in content
          ? { msg_type: 7, media: content.media, keyboard: content.keyboard }
          : { msg_type: 2, markdown: content.markdown, keyboard: content.keyboard }),
      msg_id: messageId,
      msg_seq: sequence,
    })
  }
}
