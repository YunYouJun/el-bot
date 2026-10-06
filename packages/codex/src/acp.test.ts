import type { RpcNotification } from './types'
import { realpath } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AcpClient } from './acp'
import { agentEnvironment } from './environment'

const clients: AcpClient[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()))
})
async function fixture(mode = 'resume', timeout = 1000) {
  const cwd = await realpath(process.cwd())
  const client = new AcpClient({ provider: mode === 'load' ? 'codebuddy' : 'dsh', executable: process.execPath, args: [fileURLToPath(new URL('../test/fixtures/acp.mjs', import.meta.url)), mode], projects: [cwd], requestTimeoutMs: timeout })
  clients.push(client)
  const events: RpcNotification[] = []
  client.on('notification', event => events.push(event))
  await client.start()
  return { client, cwd, events }
}
async function result(events: RpcNotification[]) {
  await vi.waitFor(() => expect(events.some(event => event.method === 'turn/completed')).toBe(true))
  return events.find(event => event.method === 'item/completed')!.params.item
}

describe('aCP agent task control', () => {
  it.each(['resume', 'load'])('continues %s sessions, ignores transcript replay and grants only one-shot approval', async (mode) => {
    const { client, cwd, events } = await fixture(mode)
    client.on('request', request => client.respond(request.id, { decision: 'accept' }))
    const thread = await client.thread({ cwd, threadId: 'saved' })
    await client.turn(thread, cwd, 'edit')
    expect(await result(events)).toMatchObject({ text: '你好\napproved:once' })
    expect(events.at(-1)?.params.turn).toMatchObject({ status: 'completed' })
    await expect(client.thread({ cwd, threadId: 'missing' })).rejects.toThrow('Agent RPC failed')
  })

  it.each(['always', 'cross-session'])('denies %s permissions without asking the user', async (mode) => {
    const { client, cwd, events } = await fixture(mode)
    const request = vi.fn()
    client.on('request', request)
    const thread = await client.thread({ cwd })
    await client.turn(thread, cwd, 'edit')
    expect(await result(events)).toMatchObject({ text: '你好\ndenied' })
    expect(request).not.toHaveBeenCalled()
  })

  it('waits for prompt settlement when cancelling and rejects concurrent task admission', async () => {
    const { client, cwd, events } = await fixture()
    const thread = await client.thread({ cwd })
    const turn = await client.turn(thread, cwd, 'wait')
    await expect(client.turn(thread, cwd, 'duplicate')).rejects.toThrow('admission')
    await client.interrupt(thread, turn.turn.id)
    expect(events.at(-1)?.params.turn).toMatchObject({ status: 'interrupted' })
    await expect(client.interrupt(thread, 'old-turn')).rejects.toThrow('unconfirmed')
  })

  it('does not claim success when cancellation is not acknowledged', async () => {
    const { client, cwd } = await fixture('resume', 200)
    const thread = await client.thread({ cwd })
    const turn = await client.turn(thread, cwd, 'hang')
    await expect(client.interrupt(thread, turn.turn.id)).rejects.toThrow('timed out')
  })

  it('rejects unknown protocol versions and malformed stdout', async () => {
    await expect(fixture('version')).rejects.toThrow('protocol version')
    const { client, cwd } = await fixture()
    const disconnected = vi.fn()
    client.on('disconnect', disconnected)
    const thread = await client.thread({ cwd })
    await client.turn(thread, cwd, 'malformed')
    await vi.waitFor(() => expect(disconnected).toHaveBeenCalledOnce())
  })

  it('checks session paths, model selection and refuses raw management calls', async () => {
    const { client, cwd } = await fixture()
    expect(await client.inspectThread('saved', cwd)).toBe('ready')
    expect(await client.inspectThread('missing', cwd)).toBe('missing')
    await client.thread({ cwd, model: 'fixture-model' })
    await expect(client.thread({ cwd: '/tmp' })).rejects.toThrow('allowlist')
    await expect(client.request('session/prompt', {})).rejects.toThrow('unavailable')
  })

  it('does not expose private provider errors in output', async () => {
    const { client, cwd, events } = await fixture()
    const thread = await client.thread({ cwd })
    await client.turn(thread, cwd, 'error')
    expect(await result(events)).toMatchObject({ text: '' })
    expect(events.at(-1)?.params.turn).toMatchObject({ status: 'failed' })
    expect(JSON.stringify(events)).not.toContain('private-secret')
  })

  it('passes only selected provider variables and strips QQ credentials', () => {
    expect(agentEnvironment({ PATH: '/bin', HOME: '/home/example', DEEPSEEK_API_KEY: 'provider-key', QQ_BOT_SECRET: 'bot-secret', UNSELECTED: 'value' }, ['DEEPSEEK_API_KEY', 'QQ_BOT_SECRET']))
      .toEqual({ PATH: '/bin', HOME: '/home/example', DEEPSEEK_API_KEY: 'provider-key' })
  })
})
