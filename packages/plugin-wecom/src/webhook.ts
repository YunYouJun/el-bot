import type { WecomInboundPayload } from './types'

export interface PostWecomWebhookOptions {
  url: string
  payload: WecomInboundPayload
  authHeader: string
  authValue: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * POST the normalized payload. The auth header name and value are sent as configured.
 * Response bodies are not copied into errors.
 */
export async function postWecomWebhook(options: PostWecomWebhookOptions): Promise<void> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }
  if (options.authHeader)
    headers[options.authHeader] = options.authValue

  const response = await (options.fetchImpl ?? fetch)(options.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(options.payload),
    redirect: 'error',
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  })
  if (!response.ok)
    throw new Error(`Grok webhook responded ${response.status}`)
}
