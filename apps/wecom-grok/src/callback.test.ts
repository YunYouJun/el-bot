import { describe, expect, it } from 'vitest'
import { waitForPublicCallback } from './callback'

describe('public callback admission', () => {
  it('waits for a newly deployed proxy route before accepting messages', async () => {
    let attempts = 0
    const fetchImpl: typeof fetch = async () => ++attempts === 1
      ? new Response(null, { status: 404 })
      : new Response(null, { status: 401, headers: { 'x-el-bot-instance': 'this-instance' } })
    await waitForPublicCallback({ url: 'https://example.test/reply', instanceId: 'this-instance', retryDelayMs: 1, fetchImpl })
    expect(attempts).toBe(2)
  })

  it('does not accept an authentication response from a different instance', async () => {
    const fetchImpl: typeof fetch = async () => new Response(null, { status: 401, headers: { 'x-el-bot-instance': 'other-instance' } })
    await expect(waitForPublicCallback({
      url: 'https://example.test/reply',
      instanceId: 'this-instance',
      timeoutMs: 20,
      retryDelayMs: 1,
      fetchImpl,
    })).rejects.toThrow('does not reach this application instance')
  })
})
