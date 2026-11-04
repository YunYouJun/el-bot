import { isRecord } from './util'

/** Keep the server's error code without retaining credentials or message bodies. */
export class WecomApiError extends Error {
  readonly code: number | undefined

  constructor(operation: 'send' | 'reply', response: unknown) {
    const code = isRecord(response) && typeof response.errcode === 'number' && Number.isSafeInteger(response.errcode)
      ? response.errcode
      : undefined
    super(`WeCom message ${operation} failed${code === undefined ? '' : ` (code ${code})`}`)
    this.name = 'WecomApiError'
    this.code = code
  }
}
