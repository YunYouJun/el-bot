import type { GroupingOptions, Header, HostContext, PeerRecord, QQManager, ReplyTarget, Route, Scope, Workspace } from './contracts'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installHooks, parsePeer, WorkspaceGrouping } from './grouping'

class World {
  headers = new Map<string, Header>()
  history = new Map<string, string[]>()
  current = new Map<string, string>()
  archived = new Set<string>()
  selections: Route[] = []
  forks = 0
  failAttach = false
  failFork = false
  index = 0

  workspace(path: string): Workspace {
    const members: string[] = []
    return {
      path,
      title: path,
      sessionIds: members,
      async setTitle() {},
      attachSession: async (id) => {
        if (this.failAttach || this.headers.get(id)?.cwd !== path)
          throw new Error('Workspace membership rejected')
        if (!members.includes(id))
          members.push(id)
      },
    }
  }

  context(): HostContext {
    return {
      workspaceRegistry: {
        create: async path => this.workspace(path),
        archiveSession: async (id) => { this.archived.add(id) },
      },
      effect: () => {},
    }
  }

  agent(header: Header, initial: Route): PeerRecord['agent'] {
    let route = initial
    return {
      status: 'idle',
      session: { header },
      model: {
        current: () => route,
        select: (next) => {
          route = next
          this.selections.push(next)
        },
      },
      whenIdle: async () => {},
    }
  }
}

class Manager implements QQManager {
  config = { appId: '123', access: { c2cAllow: ['owner'] } }
  records = new Map<string, PeerRecord>()
  host: QQManager['host']
  constructor(readonly ctx: HostContext, readonly world: World, readonly root: string) {
    this.host = { sessionHeader: async id => world.headers.get(id) }
    this.registerScopePromptInjection()
  }

  registerScopePromptInjection() {}
  workspaceDir() { return this.root }
  sessionKey(scope: Scope, peer: string) { return `qqbot:123:${scope}:${peer}` }
  async getOrCreate(scope: Scope, peer: string, sender: string, target: ReplyTarget) {
    const key = this.sessionKey(scope, peer)
    return this.records.get(key) ?? this.openSession(key, scope, peer, sender, target)
  }

  async openSession(key: string, scope: Scope, peerId: string, _sender: string, _target: ReplyTarget): Promise<PeerRecord> {
    await setImmediate()
    const id = this.world.current.get(key) ?? `new-${++this.world.index}`
    const header = this.world.headers.get(id) ?? { id, cwd: this.workspaceDir() }
    this.world.headers.set(id, header)
    const record: PeerRecord = {
      sessionKey: key,
      sessionId: id,
      scope,
      peerId,
      agent: this.world.agent(header, { provider: 'tokenlink', model: 'hy4' }),
    }
    this.world.current.set(key, id)
    this.records.set(key, record)
    return record
  }

  async rebuildSession(record: PeerRecord, _options: { route?: Route }): Promise<void> {
    if (this.world.failFork)
      return
    await setImmediate()
    const previous = record.sessionId
    const header = { id: `fork-${++this.world.index}`, parentSession: previous, cwd: this.workspaceDir() }
    this.world.headers.set(header.id, header)
    this.world.history.set(header.id, [...(this.world.history.get(previous) ?? [])])
    // Reproduce the host compatibility issue: a fork initially restores its old route.
    const previousRoute = record.agent.model?.current() ?? record.agent.options
    if (!previousRoute?.provider || !previousRoute.model)
      throw new Error('Test agent has no route')
    record.agent = this.world.agent(header, { provider: previousRoute.provider, model: previousRoute.model })
    record.sessionId = header.id
    this.world.current.set(record.sessionKey, header.id)
    this.world.forks++
  }
}

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse())
    await cleanup()
  cleanups.length = 0
})

async function fixture(companion = false) {
  const root = await mkdtemp(join(tmpdir(), 'qq-workspaces-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const world = new World()
  const options: GroupingOptions = {
    appId: '123',
    prefsFile: join(root, 'prefs.json'),
    originalDirectory: root,
    privateDirectory: join(root, 'private'),
    groupDirectory: join(root, 'groups'),
    privateTitle: '小云 Bot · 私聊',
    groupTitle: '小云 Bot · 群聊',
  }
  const ctx = world.context()
  const workspaces = { c2c: world.workspace(options.privateDirectory), group: world.workspace(options.groupDirectory) }
  const grouping = new WorkspaceGrouping(ctx, options, workspaces)
  cleanups.push(installHooks(Manager.prototype, grouping, companion))
  const manager = new Manager(companion ? world.context() : ctx, world, root)
  return { root, world, options, ctx, manager, grouping, workspaces }
}

describe('official QQ workspace lifecycle', () => {
  it('captures the official plugin context after a companion service becomes available', async () => {
    const f = await fixture(true)
    expect(f.manager.ctx).not.toBe(f.ctx)
    expect(f.grouping.manager).toBe(f.manager)
    const record = await f.manager.getOrCreate('c2c', 'owner', 'owner', { scope: 'c2c', targetId: 'owner', msgId: '' })
    expect(record.agent.session.header.cwd).toBe(f.options.privateDirectory)
    expect(f.workspaces.c2c.sessionIds).toContain(record.sessionId)
  })

  it('migrates both peers with complete history, archives only their original lineage and is idempotent', async () => {
    const f = await fixture()
    const ids = { 'qqbot:123:c2c:owner': 'private-old', 'qqbot:123:group:room': 'group-old', 'qqbot:999:c2c:other': 'unrelated' }
    for (const [key, id] of Object.entries(ids)) {
      f.world.current.set(key, id)
      f.world.headers.set(id, { id, cwd: f.root })
      f.world.history.set(id, [`history:${key}`])
    }
    await writeFile(f.options.prefsFile, JSON.stringify({ sessionIds: ids }))
    await f.grouping.migrateExisting()
    expect(f.workspaces.c2c.sessionIds).toHaveLength(1)
    expect(f.workspaces.group.sessionIds).toHaveLength(1)
    expect(f.world.history.get(f.workspaces.c2c.sessionIds[0]!)).toEqual(['history:qqbot:123:c2c:owner'])
    expect(f.world.history.get(f.workspaces.group.sessionIds[0]!)).toEqual(['history:qqbot:123:group:room'])
    expect(f.world.archived).toEqual(new Set(['private-old', 'group-old']))
    await f.grouping.migrateExisting()
    expect(f.world.forks).toBe(2)
    expect(f.manager.config.access.c2cAllow).toEqual(['owner'])
  })

  it('keeps concurrently created private and group sessions in their respective working directories', async () => {
    const f = await fixture()
    const [direct, group] = await Promise.all([
      f.manager.getOrCreate('c2c', 'owner', 'owner', { scope: 'c2c', targetId: 'owner', msgId: 'one' }),
      f.manager.getOrCreate('group', 'room', 'owner', { scope: 'group', targetId: 'room', msgId: 'two' }),
    ])
    expect(direct.agent.session.header.cwd).toBe(f.options.privateDirectory)
    expect(group.agent.session.header.cwd).toBe(f.options.groupDirectory)
    expect(f.world.forks).toBe(0)
  })

  it('retries startup ownership contention without replacing the persisted session', async () => {
    const f = await fixture()
    const id = 'group-existing'
    f.world.current.set('qqbot:123:group:room', id)
    f.world.headers.set(id, { id, cwd: f.options.groupDirectory })
    f.world.history.set(id, ['preserved before restart'])
    await writeFile(f.options.prefsFile, JSON.stringify({ sessionIds: { 'qqbot:123:group:room': id } }))
    const open = f.manager.getOrCreate.bind(f.manager)
    const error = Object.assign(new Error('session is already owned by an active write handle'), { name: 'SessionAlreadyOwnedError' })
    const resume = vi.spyOn(f.manager, 'getOrCreate').mockRejectedValueOnce(error).mockImplementation(open)
    await f.grouping.migrateExisting()
    expect(resume).toHaveBeenCalledTimes(2)
    expect(f.workspaces.group.sessionIds).toEqual([id])
    expect(f.world.history.get(id)).toEqual(['preserved before restart'])
    expect(f.world.forks).toBe(0)
  })

  it('does not retry unrelated persistence errors or replace their history', async () => {
    const f = await fixture()
    f.world.headers.set('stored', { id: 'stored', cwd: f.options.groupDirectory })
    await writeFile(f.options.prefsFile, JSON.stringify({ sessionIds: { 'qqbot:123:group:room': 'stored' } }))
    const error = new Error('Persistence unavailable')
    const resume = vi.spyOn(f.manager, 'getOrCreate').mockRejectedValue(error)
    await expect(f.grouping.migrateExisting()).rejects.toBe(error)
    expect(resume).toHaveBeenCalledTimes(1)
    expect(f.world.forks).toBe(0)
  })

  it('makes model-switch branches inherit membership and persistently selects the requested model', async () => {
    const f = await fixture()
    const record = await f.manager.getOrCreate('group', 'room', 'owner', { scope: 'group', targetId: 'room', msgId: 'one' })
    const previous = record.sessionId
    f.world.history.set(previous, ['remember this before switching'])
    const route = { provider: 'another', model: 'replacement' }
    await f.manager.rebuildSession(record, { route })
    expect(record.agent.session.header.cwd).toBe(f.options.groupDirectory)
    expect(f.workspaces.group.sessionIds).toContain(record.sessionId)
    expect(f.world.history.get(record.sessionId)).toEqual(['remember this before switching'])
    expect(record.agent.model?.current()).toEqual(route)
    expect(f.world.selections).toEqual([route])
    expect(f.world.archived.has(previous)).toBe(true)
  })

  it('reinstalls the npm Web route on resume and model forks without a Desktop model handle', async () => {
    const f = await fixture()
    const record = await f.manager.getOrCreate('group', 'room', 'owner', { scope: 'group', targetId: 'room', msgId: '' })
    const route = { provider: 'deepseek-api', model: 'deepseek-flash' }
    record.agent.model = undefined
    record.agent.options = route
    const selections: Route[] = []
    f.grouping.selectLegacy = async (_record, selected) => {
      selections.push(selected)
    }
    await f.grouping.organize(f.manager, record, Manager.prototype.rebuildSession)
    expect(selections).toEqual([route])
    const parent = record.sessionId
    record.sessionId = 'web-model-branch'
    const header = { id: record.sessionId, cwd: f.options.groupDirectory, parentSession: parent }
    record.agent.session.header = header
    f.world.headers.set(record.sessionId, header)
    await f.grouping.finishFork(f.manager, record, parent, route)
    expect(selections).toEqual([route, route])
    expect(f.workspaces.group.sessionIds).toContain('web-model-branch')
    expect(f.world.archived.has(parent)).toBe(true)
  })

  it('resumes the durable Web choice before applying stale QQ model preferences', async () => {
    const f = await fixture()
    const record = await f.manager.getOrCreate('c2c', 'owner', 'owner', { scope: 'c2c', targetId: 'owner', msgId: '' })
    record.agent.model = undefined
    record.agent.options = { provider: 'deepseek-api', model: 'deepseek-flash' }
    const openai = { provider: 'openai', model: 'gpt-6-luna' }
    f.grouping.readLegacy = () => openai
    f.grouping.selectLegacy = vi.fn(async () => {})
    await f.grouping.organize(f.manager, record, Manager.prototype.rebuildSession)
    expect(f.grouping.selectLegacy).toHaveBeenCalledWith(record, openai)
    expect(f.world.forks).toBe(0)
  })

  it('does not archive the source if the new workspace membership cannot be committed', async () => {
    const f = await fixture()
    f.world.current.set('qqbot:123:c2c:owner', 'source')
    f.world.headers.set('source', { id: 'source', cwd: f.root })
    f.world.history.set('source', ['original conversation'])
    f.world.failAttach = true
    await expect(f.manager.getOrCreate('c2c', 'owner', 'owner', { scope: 'c2c', targetId: 'owner', msgId: '' })).rejects.toThrow('membership')
    expect(f.world.archived.size).toBe(0)
    expect(f.world.history.get('source')).toEqual(['original conversation'])
  })

  it('fails clearly without hiding history when the host cannot fork', async () => {
    const f = await fixture()
    f.world.current.set('qqbot:123:c2c:owner', 'source')
    f.world.headers.set('source', { id: 'source', cwd: f.root })
    f.world.failFork = true
    await expect(f.manager.getOrCreate('c2c', 'owner', 'owner', { scope: 'c2c', targetId: 'owner', msgId: '' })).rejects.toThrow('did not complete')
    expect(f.world.archived.size).toBe(0)
  })

  it('leaves other plugin contexts untouched', async () => {
    const f = await fixture()
    const other = new Manager(f.world.context(), f.world, f.root)
    const record = await other.getOrCreate('c2c', 'elsewhere', 'elsewhere', { scope: 'c2c', targetId: 'elsewhere', msgId: '' })
    expect(record.agent.session.header.cwd).toBe(f.root)
    expect(f.workspaces.c2c.sessionIds).toEqual([])
  })

  it('ignores foreign bots, malformed keys and preferences minted by /new without a session', async () => {
    const f = await fixture()
    expect(parsePeer('qqbot:123:group:room', '123')).toEqual({ scope: 'group', peerId: 'room' })
    expect(parsePeer('qqbot:123:group:', '123')).toBeUndefined()
    expect(parsePeer('qqbot:123:other:peer', '123')).toBeUndefined()
    expect(parsePeer('qqbot:1234:group:room', '123')).toBeUndefined()
    await writeFile(f.options.prefsFile, JSON.stringify({ sessionIds: { 'qqbot:123:c2c:owner': 'not-created' } }))
    await f.grouping.migrateExisting()
    expect(f.manager.records.size).toBe(0)
  })

  it('does not restore conversations excluded by the current QQ access policy', async () => {
    const f = await fixture()
    const access: QQManager['config']['access'] = {
      c2cMode: 'allowlist',
      c2cAllow: ['owner'],
      groupMode: 'disabled',
    }
    Object.assign(f.manager.config.access, access)
    const ids = { 'qqbot:123:group:uninvited': 'denied-group', 'qqbot:123:c2c:stranger': 'denied-user' }
    for (const id of Object.values(ids))
      f.world.headers.set(id, { id, cwd: f.root })
    await writeFile(f.options.prefsFile, JSON.stringify({ sessionIds: ids }))
    await f.grouping.migrateExisting()
    expect(f.manager.records.size).toBe(0)
    expect(f.world.archived.size).toBe(0)
  })
})
