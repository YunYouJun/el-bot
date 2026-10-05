import type { RemoteState } from './types'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { readConfig } from './config'
import { bindInstance, StateStore } from './store'

describe('local state and configuration', () => {
  it('pins instance identity without losing legacy ownership or session history', async () => {
    const state: RemoteState = { version: 1, project: 'demo', threads: {}, seen: [], tasks: [] }
    state.owner = 'owner'
    state.threads.demo = { id: 'saved', cwd: '/project' }
    const identity = { appId: 'app', sandbox: false, profile: 'prod', codexHome: '/codex/prod' }
    bindInstance(state, identity)
    bindInstance(state, identity)
    for (const other of [{ ...identity, appId: 'different' }, { ...identity, sandbox: true }, { ...identity, profile: 'test' }, { ...identity, codexHome: '/codex/test' }])
      expect(() => bindInstance(state, other)).toThrow('其他机器人')
    expect(state.owner).toBe('owner')
    expect(state.threads.demo.id).toBe('saved')
    expect(state.instance).toEqual(identity)
  })
  it('locks a single instance, persists ordered snapshots and never replays interrupted tasks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'qq-codex-'))
    try {
      const filename = join(directory, 'state.json')
      const store = new StateStore(filename)
      const unlock = await store.lock()
      try {
        await expect(new StateStore(filename).lock()).rejects.toThrow('locked')
        const state = await store.load('demo')
        state.owner = 'owner'
        state.tasks.push({
          id: 'id',
          project: 'demo',
          createdAt: 'now',
          status: 'running',
          output: 'before exit',
        })
        const first = store.save(state)
        state.seen.push('message')
        await Promise.all([first, store.save(state)])
        expect(JSON.parse(await readFile(filename, 'utf8')).seen).toEqual([
          'message',
        ])
        const reloaded = await store.load('demo')
        expect(reloaded.owner).toBe('owner')
        expect(reloaded.tasks[0].status).toBe('interrupted')
        reloaded.tasks[0].status = 'failed'
        reloaded.tasks[0].failure = 'authentication'
        await store.save(reloaded)
        expect((await store.load('demo')).tasks[0].failure).toBe('authentication')
        await store.backupLegacy()
        const backup = await readFile(`${filename}.before-instance.json`, 'utf8')
        await store.save({ ...reloaded, seen: ['newer'] })
        await store.backupLegacy()
        expect(await readFile(`${filename}.before-instance.json`, 'utf8')).toBe(backup)
        if (process.platform !== 'win32')
          expect((await stat(`${filename}.before-instance.json`)).mode & 0o777).toBe(0o600)
        await writeFile(filename, JSON.stringify({ ...reloaded, tasks: [{ ...reloaded.tasks[0], failure: 'private-unrecognized-error' }] }))
        await expect(store.load('demo')).rejects.toThrow('Invalid persisted task')
        if (process.platform !== 'win32')
          expect((await stat(filename)).mode & 0o777).toBe(0o600)
      }
      finally {
        await unlock()
      }
      await writeFile(filename, '{"version":99}')
      await expect(store.load('demo')).rejects.toThrow('Invalid state')
      await writeFile(filename, '{"owner":"private-owner-content" broken')
      await expect(store.load('demo')).rejects.toThrow(/^Invalid state JSON; restore a backup instead of resetting ownership$/)
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('resolves configured project paths locally and rejects invalid names', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'qq-codex-config-'))
    try {
      const filename = join(directory, 'config.json')
      await writeFile(filename, JSON.stringify({ projects: { demo: '.' } }))
      const config = await readConfig(filename)
      expect(config.defaultProject).toBe('demo')
      expect(config.projects.demo).toContain('qq-codex-config-')
      await writeFile(filename, JSON.stringify({ projects: { '../bad': '.' } }))
      await expect(readConfig(filename)).rejects.toThrow('Project names')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
