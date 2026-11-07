import type { SessionLifecycleRuntime } from './session-lifecycle'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionLifecycle } from './session-lifecycle'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'session-lifecycle-'))
  directories.push(directory)
  const root = join(directory, 'sessions')
  const sessionPath = join(root, 'project', 'session-test')
  await mkdir(sessionPath, { recursive: true })
  await writeFile(join(sessionPath, 'v1.jsonl'), 'private history')
  const live = new Map<string, { id: string, status: string }>()
  const archived: string[] = []
  const make = async () => {
    const agent = { id: 'session-test', status: 'idle' }
    live.set(agent.id, agent)
    return { agent, dispose: vi.fn(async () => {
      live.delete(agent.id)
    }) }
  }
  const runtime: SessionLifecycleRuntime = {
    agents: { get: id => live.get(id), create: make, resume: make },
    sessions: { get: id => live.get(id) },
    sessionPersistence: {
      name: 'session-persistence-jsonl',
      root,
      locate: () => ({ kind: 'jsonl', path: join(sessionPath, 'v1.jsonl') }),
      stat: async () => {
        try {
          await access(sessionPath)
          return { header: { id: 'session-test' } }
        }
        catch { return undefined }
      },
      open: vi.fn(async () => ({ close: vi.fn(async () => {}) })),
    },
    workspaceRegistry: {
      archivedSessionIds: archived,
      archiveSession: vi.fn(async (id) => {
        if (live.get(id)?.status === 'running')
          throw Object.assign(new Error('Active job'), { code: 'workspace/session-active' })
        if (!archived.includes(id))
          archived.push(id)
      }),
      unarchiveSession: async (id) => { archived.splice(archived.indexOf(id), 1) },
    },
    eraseProjectionCache: vi.fn(async () => {}),
  }
  const journal = join(directory, 'lifecycle.json')
  const service = new SessionLifecycle(runtime, journal)
  await service.load()
  return { directory, root, sessionPath, live, archived, runtime, journal, service }
}

it('archives/restores without deleting history and erases a captured live writer durably', async () => {
  const f = await fixture()
  const originalCreate = f.runtime.agents.create
  const handle = await f.runtime.agents.create()
  await f.service.archive('session-test', true)
  expect(f.archived).toContain('session-test')
  expect(await readFile(join(f.sessionPath, 'v1.jsonl'), 'utf8')).toContain('private history')
  await f.service.archive('session-test', false)
  expect(f.archived).toEqual([])
  await f.service.remember('session-test', { platform: 'qq', kind: 'group', peerId: 'group-a', lastMessage: { id: 'm', senderId: 'u', text: 'must not be copied', createdAt: new Date().toISOString(), type: 'text' } })
  expect(await readFile(f.journal, 'utf8')).not.toContain('must not be copied')
  const detach = vi.fn(async () => {})
  await Promise.all([f.service.erase('session-test', detach), f.service.erase('session-test', detach)])
  expect(handle.dispose).toHaveBeenCalledOnce()
  expect(detach).toHaveBeenCalledOnce()
  expect(f.runtime.eraseProjectionCache).toHaveBeenCalledExactlyOnceWith('session-test')
  await expect(access(f.sessionPath)).rejects.toThrow()
  expect(f.service.deleted('session-test')).toBe(true)
  expect(f.service.source('session-test')).toBeUndefined()
  expect(() => f.service.assertAvailable('session-test')).toThrow('session_not_found')
  await f.service.close()
  expect(f.runtime.agents.create).not.toBe(originalCreate)
  const restarted = new SessionLifecycle(f.runtime, f.journal)
  await restarted.load()
  expect(restarted.deleted('session-test')).toBe(true)
  await restarted.close()
})

it('refuses active work before touching bindings or storage, including native archive activity', async () => {
  const f = await fixture()
  f.live.set('session-test', { id: 'session-test', status: 'running' })
  const detach = vi.fn(async () => {})
  await expect(f.service.erase('session-test', detach)).rejects.toThrow('session_active')
  expect(f.archived).toEqual([])
  expect(detach).not.toHaveBeenCalled()
  expect(f.runtime.sessionPersistence.open).not.toHaveBeenCalled()
  await expect(f.service.archive('session-test', true)).rejects.toThrow('Active job')
  await f.service.close()
})

it('retains a retryable deletion fence on foreign ownership and completes after restart', async () => {
  const f = await fixture()
  f.live.set('session-test', { id: 'session-test', status: 'idle' })
  await expect(f.service.erase('session-test', async () => {})).rejects.toThrow('session_owner_unavailable')
  expect(f.service.pending).toEqual(['session-test'])
  expect(() => f.service.assertAvailable('session-test')).toThrow('session_deleting')
  expect(await readFile(join(f.sessionPath, 'v1.jsonl'), 'utf8')).toContain('private history')
  await f.service.close()
  f.live.clear()
  const restarted = new SessionLifecycle(f.runtime, f.journal)
  await restarted.load()
  await restarted.erase('session-test', async () => {})
  expect(restarted.deleted('session-test')).toBe(true)
  await restarted.close()
})

it('refuses symlinked session directories and paths outside the persistence root', async () => {
  for (const escape of [false, true]) {
    const f = await fixture()
    const outside = join(f.directory, 'unrelated')
    await mkdir(outside)
    await writeFile(join(outside, 'keep'), 'unrelated')
    if (escape) {
      f.runtime.sessionPersistence.locate = () => ({ kind: 'jsonl', path: join(outside, 'v1.jsonl') })
    }
    else {
      await rm(f.sessionPath, { recursive: true })
      await symlink(outside, f.sessionPath)
    }
    await expect(f.service.erase('session-test', async () => {})).rejects.toThrow('invalid_session_location')
    expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('unrelated')
    await f.service.close()
  }
})

it('does not acknowledge deletion until the projection cache is erased and allows a clean retry', async () => {
  const f = await fixture()
  f.runtime.eraseProjectionCache = vi.fn(async () => {
    throw new Error('Cache write failed')
  })
  await expect(f.service.erase('session-test', async () => {})).rejects.toThrow('Cache write failed')
  expect(f.service.deleted('session-test')).toBe(false)
  expect(f.service.pending).toEqual(['session-test'])
  await expect(access(f.sessionPath)).rejects.toThrow()
  f.runtime.eraseProjectionCache = vi.fn(async () => {})
  await f.service.erase('session-test', async () => {})
  expect(f.service.deleted('session-test')).toBe(true)
  await f.service.close()
})

it('rejects a prompt that starts during archive persistence without disposing its active writer', async () => {
  const f = await fixture()
  const handle = await f.runtime.agents.create()
  f.runtime.workspaceRegistry.archiveSession = async (id) => {
    f.archived.push(id)
    handle.agent.status = 'running'
  }
  const detach = vi.fn(async () => {})
  await expect(f.service.erase('session-test', detach)).rejects.toThrow('session_active')
  expect(f.archived).toEqual([])
  expect(detach).not.toHaveBeenCalled()
  expect(handle.dispose).not.toHaveBeenCalled()
  expect(f.service.pending).toEqual([])
  expect(await readFile(join(f.sessionPath, 'v1.jsonl'), 'utf8')).toContain('private history')
  await f.service.close()
})

it('serializes native admission against archiving and rejects activity owned by an idle session', async () => {
  const f = await fixture()
  const prompt = vi.fn(async () => {})
  await f.service.archive('session-test', true)
  await expect(f.service.admit('session-test', prompt)).rejects.toThrow('session_archived')
  expect(prompt).not.toHaveBeenCalled()
  await f.service.archive('session-test', false)
  f.runtime.activity = async () => [{ kind: 'job' }]
  await expect(f.service.erase('session-test', async () => {})).rejects.toThrow('session_active')
  expect(f.service.deleted('session-test')).toBe(false)
  await f.service.close()
})

it('deletes an empty session that never materialized a log file', async () => {
  const f = await fixture()
  await rm(f.sessionPath, { recursive: true })
  const handle = await f.runtime.agents.create()
  await f.service.erase('session-test', async () => {})
  expect(handle.dispose).toHaveBeenCalledOnce()
  expect(f.runtime.sessionPersistence.open).not.toHaveBeenCalled()
  expect(f.service.deleted('session-test')).toBe(true)
  await f.service.close()
})
