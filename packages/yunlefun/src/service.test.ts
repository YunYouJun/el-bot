import type { Fetch } from './protocol'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAdapter, PROVIDER } from './adapter'
import { DEFAULT_RUNTIME_ORIGIN, YunlefunError } from './protocol'
import { YunlefunService } from './service'
import { AccountStore } from './store'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
const model = { modelId: 'flash', displayName: 'Flash', policyVersion: 'v1', tools: true, maxOutputTokens: 8192, maxInputBytes: 96 * 1024, pricing: { userRateBps: 15000 } }
const input = { messages: [{ role: 'user', content: 'Read the README' }], tools: [], maxOutputTokens: 100, temperatureMilli: 700 }
const finished = { taskId: 'task-1', status: 'completed', billingStatus: 'settled', result: { message: { role: 'assistant', content: 'Done' }, finishReason: 'stop' }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, chargedMicroPoints: 12 } }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'el-bot-yunlefun-test-'))
  directories.push(directory)
  const path = join(directory, 'account.json')
  const store = new AccountStore(path)
  await store.load()
  await store.change(state => state.authorization = { uid: 'user-1', entitlement: 'private-entitlement', refreshToken: 'private-refresh', expiresAt: Date.now() + 3600000 })
  return { store, path }
}
describe('yunLeFun point provider', () => {
  it('restores a lost submit response after restart by looking up the same request, without a second submission', async () => {
    const f = await fixture()
    const requests: Record<string, unknown>[] = []
    let originalId: unknown
    const transport: Fetch = async (_url, init) => {
      const envelope = JSON.parse(String(init?.body))
      const request = JSON.parse(envelope.request)
      requests.push(request)
      if (request.action === 'submit') {
        originalId = request.requestId
        throw new Error('response lost after server admission')
      }
      if (request.action === 'lookup') {
        expect(request.requestId).toBe(originalId)
        return response({ taskId: 'task-1' })
      }
      if (request.action === 'snapshot')
        return response(finished)
      throw new Error('Unexpected request')
    }
    const first = new YunlefunService(f.store, DEFAULT_RUNTIME_ORIGIN, { fetch: transport })
    await expect(first.generate(model, input, 'fingerprint')).rejects.toMatchObject({ code: 'NETWORK_UNCERTAIN' })
    const status = await first.status()
    expect(status.tasks).toHaveLength(1)
    expect(JSON.stringify(status)).not.toContain('private-')
    expect(JSON.stringify(status)).not.toContain('Read the README')
    const restored = new AccountStore(f.path)
    await restored.load()
    const second = new YunlefunService(restored, DEFAULT_RUNTIME_ORIGIN, { fetch: transport })
    expect(await second.recover(status.tasks[0]!.requestId)).toMatchObject({ billingStatus: 'settled' })
    expect(requests.filter(item => item.action === 'submit')).toHaveLength(1)
    expect((await second.status()).tasks).toHaveLength(0)
    expect((await stat(f.path)).mode & 0o777).toBe(0o600)
    expect(await readFile(f.path, 'utf8')).not.toContain('Read the README')
  })
  it('never creates work while cancelling an admission with an unknown result', async () => {
    const f = await fixture()
    const calls: string[] = []
    const transport: Fetch = async (_url, init) => {
      const request = JSON.parse(JSON.parse(String(init?.body)).request)
      calls.push(request.action)
      if (request.action === 'submit')
        throw new Error('lost response')
      return response({ error: { code: 'TASK_NOT_FOUND' } }, 404)
    }
    const service = new YunlefunService(f.store, DEFAULT_RUNTIME_ORIGIN, { fetch: transport })
    await expect(service.generate(model, input, 'first')).rejects.toThrow()
    await expect(service.generate(model, input, 'different')).rejects.toMatchObject({ code: 'TASK_PENDING' })
    await expect(service.recover((await service.status()).tasks[0]!.requestId, true)).rejects.toMatchObject({ code: 'TASK_PENDING' })
    expect(calls).toEqual(['submit', 'lookup'])
    await expect(service.disconnect()).rejects.toMatchObject({ code: 'TASK_PENDING' })
  })
  it('never replays a rotating refresh credential after a lost response, including after restart', async () => {
    const f = await fixture()
    await f.store.change(state => state.authorization!.expiresAt = Date.now() + 1000)
    let requests = 0
    const transport: Fetch = async () => {
      requests++
      throw new Error('refresh response lost')
    }
    const first = new YunlefunService(f.store, DEFAULT_RUNTIME_ORIGIN, { fetch: transport })
    await expect(first.catalog()).rejects.toMatchObject({ code: 'NETWORK_UNCERTAIN' })
    const restored = new AccountStore(f.path)
    await restored.load()
    await expect(new YunlefunService(restored, DEFAULT_RUNTIME_ORIGIN, { fetch: transport }).catalog()).rejects.toMatchObject({ code: 'AUTH_REFRESH_UNCERTAIN' })
    expect(requests).toBe(1)
  })
  it('requires explicit point consent and never confuses an existing login with authorization', async () => {
    const f = await fixture()
    await f.store.change(state => delete state.authorization)
    let calls = 0
    const service = new YunlefunService(f.store, DEFAULT_RUNTIME_ORIGIN, { fetch: async () => {
      calls++
      throw new Error('must not call')
    } })
    await expect(service.start(false)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' })
    await expect(service.generate(model, input, 'id')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(calls).toBe(0)
  })
  it('keeps a definitive pre-admission rejection retryable under a newly refreshed price', async () => {
    const f = await fixture()
    const ids: unknown[] = []
    const transport: Fetch = async (_url, init) => {
      const request = JSON.parse(JSON.parse(String(init?.body)).request)
      if (request.action === 'submit') {
        ids.push(request.requestId)
        return request.policyVersion === 'v1' ? response({ error: { code: 'CATALOG_STALE' } }, 409) : response({ taskId: 'task-1' }, 202)
      }
      return response(finished)
    }
    const service = new YunlefunService(f.store, DEFAULT_RUNTIME_ORIGIN, { fetch: transport })
    await expect(service.generate(model, input, 'same-message')).rejects.toMatchObject({ code: 'CATALOG_STALE' })
    expect((await service.status()).tasks).toHaveLength(0)
    await expect(service.generate({ ...model, policyVersion: 'v2' }, input, 'same-message')).resolves.toMatchObject({ billingStatus: 'settled' })
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })
  it('returns tool calls through the host adapter only after settlement and emits usage before finish', async () => {
    const f = await fixture()
    const endpoints: string[] = []
    const transport: Fetch = async (url, init) => {
      endpoints.push(String(url))
      const request = JSON.parse(JSON.parse(String(init?.body)).request)
      if (request.action === 'catalog')
        return response({ applicationId: 'el-bot', models: [model], account: { availableMicroPoints: 1000 } })
      if (request.action === 'submit')
        return response({ taskId: 'task-1' }, 202)
      return response({ ...finished, result: { message: { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'read', arguments: '{"path":"README.md"}' } }] }, finishReason: 'tool_calls' } })
    }
    class Base {
      async* stream(): AsyncIterable<{
        type: string
      }> {
        throw new Error('unused')
      }
    }
    const adapter = createAdapter(Base, new YunlefunService(f.store, DEFAULT_RUNTIME_ORIGIN, { fetch: transport }))
    const chunks = await Array.fromAsync(adapter.stream({ provider: PROVIDER, model: 'flash', messages: [{ id: 'message-1', role: 'user', content: [{ type: 'text', text: 'Read README' }] }], tools: [{ name: 'read', description: 'Read', parameters: { type: 'object' } }] }))
    expect(chunks.map(row => row.type)).toEqual(['block-start', 'tool-call-delta', 'block-end', 'usage', 'finish'])
    expect(chunks[1]).toMatchObject({ argumentsDelta: '{"path":"README.md"}' })
    expect(chunks.at(-1)).toMatchObject({ reason: { kind: 'tool-calls' } })
    expect(endpoints.every(url => url === `${DEFAULT_RUNTIME_ORIGIN}/ai/v1/el-bot/agent`)).toBe(true)
  })
  it('keeps insufficient-balance requests unfunded and permits a fresh retry after topping up', async () => {
    const f = await fixture()
    let funded = false
    const ids: unknown[] = []
    const transport: Fetch = async (_url, init) => {
      const request = JSON.parse(JSON.parse(String(init?.body)).request)
      if (request.action === 'submit') {
        ids.push(request.requestId)
        return funded ? response({ taskId: 'task-1' }, 202) : response({ error: { code: 'AI_POINTS_INSUFFICIENT' } }, 402)
      }
      return response(finished)
    }
    const service = new YunlefunService(f.store, DEFAULT_RUNTIME_ORIGIN, { fetch: transport })
    await expect(service.generate(model, input, 'id')).rejects.toEqual(new YunlefunError('AI_POINTS_INSUFFICIENT', 402))
    expect((await service.status()).tasks).toHaveLength(0)
    funded = true
    await expect(service.generate(model, input, 'id')).resolves.toMatchObject({ billingStatus: 'settled' })
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })
})
