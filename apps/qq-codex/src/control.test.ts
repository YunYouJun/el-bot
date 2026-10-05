import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runtimeStatus, serveControl, startBackground, stopBackground } from './control'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'el-control-test-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  const state = join(directory, 'state.json')
  await writeFile(`${state}.lock`, String(process.pid), { mode: 0o600 })
  return state
}

describe('local control identity', () => {
  it('starts one detached process for concurrent clients and restarts after releasing the lock', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'el-control-process-'))
    cleanups.push(() => rm(directory, { recursive: true, force: true }))
    const paths = { state: join(directory, 'state.json'), config: join(directory, 'config.json'), envFile: join(directory, 'private.env') }
    const launcher = { executable: process.execPath, args: ['--import', 'tsx', join(process.cwd(), 'apps/qq-codex/test/fixtures/control-runtime.ts')] }
    cleanups.push(async () => {
      await stopBackground(paths.state)
    })
    const [first, second] = await Promise.all([startBackground(paths, launcher), startBackground(paths, launcher)])
    expect(first.pid).toBe(second.pid)
    expect(first.phase).toBe('running')
    expect((await stopBackground(paths.state)).phase).toBe('stopped')
    expect((await runtimeStatus(paths.state)).phase).toBe('stopped')
    const restarted = await startBackground(paths, launcher)
    expect(restarted.pid).not.toBe(first.pid)
  })

  it('returns only verified runtime status and sends stop through IPC', async () => {
    const state = await fixture()
    const stop = vi.fn(async () => {})
    cleanups.push(await serveControl(state, () => ({ phase: 'running', qq: 'connected', codex: 'connected', busy: false }), stop))
    expect((await runtimeStatus(state)).phase).toBe('running')
    expect((await stopBackground(state)).phase).toBe('stopped')
    expect(stop).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('refuses mismatched locks and unsafe descriptors without signaling a PID', async () => {
    const state = await fixture()
    const stop = vi.fn(async () => {})
    cleanups.push(await serveControl(state, () => ({ phase: 'running', qq: 'connected', codex: 'connected', busy: false }), stop))
    await writeFile(`${state}.lock`, '99999999')
    expect((await runtimeStatus(state)).phase).toBe('unmanaged')
    await expect(stopBackground(state, true)).rejects.toThrow('状态锁')
    await writeFile(`${state}.lock`, String(process.pid))
    if (process.platform !== 'win32') {
      await chmod(`${state}.control.json`, 0o644)
      expect((await runtimeStatus(state)).phase).toBe('unmanaged')
    }
    expect(stop).not.toHaveBeenCalled()
  })

  it('rejects a forged token and isolates different state files', async () => {
    const state = await fixture()
    const stop = vi.fn(async () => {})
    cleanups.push(await serveControl(state, () => ({ phase: 'running', qq: 'connected', codex: 'connected', busy: false }), stop))
    const descriptor = JSON.parse(await readFile(`${state}.control.json`, 'utf8'))
    const reply = await new Promise<string>((done, reject) => {
      const socket = connect(descriptor.endpoint)
      let data = ''
      socket.on('error', reject)
      socket.on('connect', () => socket.write(`${JSON.stringify({ ...descriptor, token: '0'.repeat(64), operation: 'stop', interrupt: true })}\n`))
      socket.on('data', chunk => data += chunk.toString())
      socket.on('end', () => done(data))
    })
    expect(JSON.parse(reply).ok).toBe(false)
    expect(stop).not.toHaveBeenCalled()
    const other = await fixture()
    await writeFile(`${other}.control.json`, JSON.stringify(descriptor), { mode: 0o600 })
    expect((await runtimeStatus(other)).phase).toBe('unmanaged')
  })

  it('propagates busy refusal and permits an explicit interrupt', async () => {
    const state = await fixture()
    cleanups.push(await serveControl(state, () => ({ phase: 'running', qq: 'connected', codex: 'connected', busy: true }), async (interrupt) => {
      if (!interrupt)
        throw new Error('仍有任务')
    }))
    await expect(stopBackground(state)).rejects.toThrow('仍有任务')
    expect((await stopBackground(state, true)).phase).toBe('stopped')
  })
})
