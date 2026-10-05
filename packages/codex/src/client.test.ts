import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexClient } from './client'

const clients: CodexClient[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.close()))
  vi.unstubAllEnvs()
})
function client(timeout = 2000, experimentalApi = false, codexHome?: string) {
  const instance = new CodexClient({
    executable: process.execPath,
    args: [
      fileURLToPath(
        new URL('../test/fixtures/app-server.mjs', import.meta.url),
      ),
    ],
    requestTimeoutMs: timeout,
    experimentalApi,
    codexHome,
  })
  clients.push(instance)
  return instance
}

describe('codex app-server stdio', () => {
  it('uses the selected Codex home instead of an ambient account and session directory', async () => {
    vi.stubEnv('CODEX_HOME', '/ambient-codex')
    const codex = client(2000, false, '/isolated-codex')
    await codex.start()
    expect(await codex.request('codex-home', {})).toEqual({ home: '/isolated-codex' })
  })
  it('opts into experimental methods only explicitly and runs reviews in the scoped thread', async () => {
    const stable = client()
    await stable.start()
    expect(await stable.request('handshake', {})).not.toHaveProperty('capabilities')
    const experimental = client(2000, true)
    await experimental.start()
    expect(await experimental.request('handshake', {})).toHaveProperty('capabilities.experimentalApi', true)
    expect(await experimental.forkThread({ cwd: '/project', threadId: 'saved' })).toBe('forked-1')
    expect(await experimental.review('forked-1', { type: 'uncommittedChanges' })).toMatchObject({ turn: { id: 'review-1' } })
    expect(await experimental.steer('forked-1', 'review-1', 'Focus on tests')).toEqual({ turnId: 'review-1' })
  })
  it('initializes, resumes threads, accepts single approvals and receives completion', async () => {
    const codex = client()
    const notify = vi.fn()
    codex.on('notification', notify)
    codex.on('request', request =>
      codex.respond(request.id, { decision: 'accept' }))
    expect(await codex.thread({ cwd: '/project' })).toBe('thread-1')
    expect(
      await codex.thread({ cwd: '/project', threadId: 'saved-thread' }),
    ).toBe('saved-thread')
    expect(await codex.turn('thread-1', '/project', 'hello')).toMatchObject({
      turn: { id: 'turn-1' },
    })
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'turn/completed' }),
      ),
    )
  })

  it('interrupts turns and strips QQ credentials from the subprocess', async () => {
    vi.stubEnv('QQ_BOT_SECRET', 'should-not-reach-codex')
    const codex = client()
    const notice = vi.fn()
    codex.on('notification', notice)
    await codex.start()
    expect(await codex.request('environment', {})).toEqual({})
    await codex.interrupt('thread-1', 'turn-1')
    await vi.waitFor(() =>
      expect(notice).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            turn: expect.objectContaining({ status: 'interrupted' }),
          }),
        }),
      ),
    )
  })

  it('rejects in-flight requests on process exit', async () => {
    const codex = client()
    await codex.start()
    await expect(codex.request('exit', {})).rejects.toThrow('exited')
  })

  it('terminates uncertain execution after a request timeout', async () => {
    const codex = client()
    const disconnected = vi.fn()
    codex.on('disconnect', disconnected)
    await codex.start()
    vi.useFakeTimers()
    try {
      const assertion = expect(codex.request('never-reply', {})).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(2001)
      await assertion
      expect(disconnected).toHaveBeenCalled()
    }
    finally {
      vi.useRealTimers()
    }
  })
})
