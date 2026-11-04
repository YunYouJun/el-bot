import { setTimeout as delay } from 'node:timers/promises'

/** Wait for the proxy to discover this instance before admitting WeCom messages. */
export async function waitForPublicCallback(options: {
  url: string
  instanceId: string
  timeoutMs?: number
  retryDelayMs?: number
  fetchImpl?: typeof fetch
}) {
  const signal = AbortSignal.timeout(options.timeoutMs ?? 20_000)
  while (!signal.aborted) {
    try {
      const response = await (options.fetchImpl ?? fetch)(options.url, { method: 'POST', redirect: 'error', signal })
      await response.body?.cancel()
      if (response.status === 401 && response.headers.get('x-el-bot-instance') === options.instanceId)
        return
    }
    catch {
      // A newly created container may not yet have a route or a live upstream.
    }
    try {
      await delay(options.retryDelayMs ?? 1000, undefined, { signal })
    }
    catch {
      break
    }
  }
  throw new Error('The public Grok callback does not reach this application instance')
}
