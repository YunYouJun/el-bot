import type { WecomGroupWebhookMessage } from './types'
import { isRecord } from './util'

export interface SendWecomGroupWebhookOptions {
  url: string
  message: WecomGroupWebhookMessage
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/** Send a group notification. Never include the webhook key or response body in errors. */
export async function sendWecomGroupWebhook(options: SendWecomGroupWebhookOptions): Promise<void> {
  let response: Response
  try {
    response = await (options.fetchImpl ?? fetch)(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options.message),
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    })
  }
  catch {
    throw new Error('WeCom group webhook request failed')
  }
  if (!response.ok)
    throw new Error(`WeCom group webhook responded ${response.status}`)

  let result: unknown
  try {
    result = await response.json()
  }
  catch {
    throw new Error('WeCom group webhook returned an invalid response')
  }
  if (!isRecord(result) || typeof result.errcode !== 'number')
    throw new Error('WeCom group webhook returned an invalid response')
  if (result.errcode !== 0)
    throw new Error(`WeCom group webhook failed: ${result.errcode}`)
}
