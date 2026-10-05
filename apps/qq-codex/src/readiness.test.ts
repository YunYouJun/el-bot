import type { CodexReadinessClient, RemoteConfig } from './types'
import { describe, expect, it, vi } from 'vitest'
import { checkCodexReadiness } from './readiness'

const config: RemoteConfig = { projects: { demo: '/demo' }, defaultProject: 'demo', transport: 'websocket', webhookPort: 8788, sandbox: false, messageFormat: 'markdown' }
function client(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    'account/read': { account: { type: 'chatgpt' }, requiresOpenaiAuth: true },
    'model/list': { data: [{ model: 'supported', isDefault: true }], nextCursor: null },
    'config/read': { config: { model: 'supported', model_provider: null } },
    ...overrides,
  }
  const request = vi.fn<CodexReadinessClient['request']>(async (method: string) => responses[method])
  return { request }
}

describe('local Codex readiness', () => {
  it('rejects a configured model absent from the ChatGPT catalog even when login metadata is present', async () => {
    const codex = client({ 'config/read': { config: { model: 'gpt-6.1-sol' } } })
    await expect(checkCodexReadiness(codex, config)).rejects.toThrow('"model": "supported"')
    expect(codex.request).toHaveBeenCalledWith('account/read', { refreshToken: true })
    expect(codex.request).not.toHaveBeenCalledWith('turn/start', expect.anything())
  })

  it('allows an explicit remote model to override an unsupported local default', async () => {
    const codex = client({ 'config/read': { config: { model: 'unsupported' } } })
    await expect(checkCodexReadiness(codex, { ...config, model: 'supported' })).resolves.toBeUndefined()
    expect(codex.request).toHaveBeenCalledWith('config/read', { cwd: '/demo', includeLayers: false })
  })

  it('preserves custom-provider and API-key configurations', async () => {
    await expect(checkCodexReadiness(client({ 'config/read': { config: { model: 'custom', model_provider: 'custom-provider' } } }), config)).resolves.toBeUndefined()
    const codex = client({ 'account/read': { account: { type: 'apiKey' } } })
    await expect(checkCodexReadiness(codex, config)).resolves.toBeUndefined()
    expect(codex.request).not.toHaveBeenCalledWith('model/list', expect.anything())
  })

  it('rejects a missing account and follows catalog pagination', async () => {
    await expect(checkCodexReadiness(client({ 'account/read': { account: null, requiresOpenaiAuth: true } }), config)).rejects.toThrow('codex login')
    const codex = client()
    codex.request.mockResolvedValueOnce({ account: { type: 'chatgpt' } })
      .mockResolvedValueOnce({ data: [{ model: 'first' }], nextCursor: 'next' })
      .mockResolvedValueOnce({ data: [{ model: 'supported', isDefault: true }], nextCursor: null })
    await expect(checkCodexReadiness(codex, config)).resolves.toBeUndefined()
    expect(codex.request).toHaveBeenCalledWith('model/list', { includeHidden: true, cursor: 'next' })
  })
})
