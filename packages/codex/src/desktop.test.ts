import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexDesktopClient } from './desktop'

const clients: CodexDesktopClient[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()))
  vi.unstubAllEnvs()
})

function client() {
  const instance = new CodexDesktopClient({ server: fileURLToPath(new URL('../test/fixtures/desktop.mjs', import.meta.url)), pipePath: '/host/explicit-pipe', threadId: 'dedicated-chat', requestTimeoutMs: 2000 })
  clients.push(instance)
  return instance
}

describe('codex Desktop MCP adapter', () => {
  it('discovers the host catalog, passes real chat metadata and strips QQ credentials', async () => {
    vi.stubEnv('QQ_BOT_SECRET', 'must-not-leak')
    const desktop = client()
    expect((await desktop.listTools()).map(tool => tool.name)).toEqual(['list_projects', 'set_thread_title'])
    const result = await desktop.call('list_projects', {}) as { content: { text: string }[] }
    expect(JSON.parse(result.content[0].text)).toEqual({ tool: 'list_projects', arguments: {}, pipe: '/host/explicit-pipe' })
  })

  it('rejects nonexistent tools and invalid parameters before forwarding', async () => {
    const desktop = client()
    await expect(desktop.call('not-installed', {})).rejects.toThrow('unavailable')
    await expect(desktop.call('set_thread_title', { title: 1 })).rejects.toThrow('arguments')
    await expect(desktop.call('set_thread_title', { title: 'Reviewed' })).resolves.toHaveProperty('content')
  })
})
