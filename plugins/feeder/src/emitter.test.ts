import { createServer } from 'node:http'
import RssFeedEmitter from 'rss-feed-emitter'
import { expect, it, vi } from 'vitest'

it.each(['none', 'http', 'xml'])('skips the first successful load and emits updates once (initial failure: %s)', async (initialFailure) => {
  let revision = 1
  let requests = 0
  const received: { title: string, link: string }[] = []
  const errors: unknown[] = []
  const emitter = new RssFeedEmitter({ skipFirstLoad: true })
  emitter.on('subscription', item => received.push({ title: item.title, link: item.link }))
  emitter.on('error', error => errors.push(error))
  const server = createServer((_request, response) => {
    requests++
    if (initialFailure !== 'none' && requests === 1) {
      response.statusCode = initialFailure === 'http' ? 503 : 200
      response.end(initialFailure === 'http' ? '' : 'invalid XML')
      return
    }
    response.setHeader('Content-Type', 'application/rss+xml')
    response.end(`<?xml version="1.0"?>
      <rss version="2.0"><channel><title>Fixture feed</title><link>https://example.test/</link><description>Local fixture</description>
        <item><guid>old</guid><title>Existing item</title><link>https://example.test/old</link><pubDate>Wed, 04 Nov 2026 00:00:00 GMT</pubDate></item>
        ${revision === 2 ? '<item><guid>new</guid><title>Updated item</title><link>https://example.test/new</link><pubDate>Thu, 05 Nov 2026 00:00:00 GMT</pubDate></item>' : ''}
      </channel></rss>`)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Local RSS server did not open a TCP port')
  const url = `http://127.0.0.1:${address.port}/feed.xml`
  try {
    emitter.add({ url, refresh: 50, eventName: 'subscription' })
    await vi.waitFor(() => expect(emitter.list[0]?.items).toHaveLength(1), { timeout: 3000, interval: 10 })
    expect(received).toEqual([])
    revision = 2
    await vi.waitFor(() => expect(received).toEqual([{ title: 'Updated item', link: 'https://example.test/new' }]), { timeout: 3000, interval: 10 })
    const previousRequests = requests
    await vi.waitFor(() => expect(requests).toBeGreaterThan(previousRequests + 1), { timeout: 3000, interval: 10 })
    expect(received).toHaveLength(1)
    expect(errors).toHaveLength(initialFailure === 'none' ? 0 : 1)
    emitter.remove(url)
    expect(emitter.list).toHaveLength(0)
  }
  finally {
    emitter.destroy()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
