import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// Run with tsx against repository source, or node with a built mobile entry as argv[3].
// Runtime dependencies come from an isolated DSH installation; all test data is temporary.
async function main() {
  const runtime = resolve(process.argv[2] ?? '/opt/dsh-runtime')
  const rootRequire = createRequire(join(runtime, 'package.json'))
  const resolvers = [rootRequire]
  for (const name of ['dsh', 'dsh-base'])
    resolvers.push(createRequire(rootRequire.resolve(`@deepseek-ai/${name}/package.json`)))
  const require = Object.assign(name => rootRequire(require.resolve(name)), {
    resolve(name) {
      for (const resolve of resolvers) {
        try {
          return resolve.resolve(name)
        }
        catch (error) {
          if (error.code !== 'MODULE_NOT_FOUND')
            throw error
        }
      }
      return rootRequire.resolve(name)
    },
  })
  const load = name => import(pathToFileURL(require.resolve(name)).href)
  for (const name of ['dsh-agent', 'dsh-session', 'dsh-workspace', 'dsh-session-persistence-jsonl'])
    assert.ok(['0.2.1-rc.5', '0.2.2-rc.1'].includes(require(`@deepseek-ai/${name}/package.json`).version))
  const { Context } = await load('@deepseek-ai/cordis')
  const { default: Storage } = await load('@deepseek-ai/dsh-storage')
  const JsonStorage = await load('@deepseek-ai/dsh-storage-json')
  const DomainStorage = await load('@deepseek-ai/dsh-storage-domain')
  const { default: SessionStore } = await load('@deepseek-ai/dsh-session')
  const { default: SessionProjections } = await load('@deepseek-ai/dsh-session-projection')
  const Persistence = await load('@deepseek-ai/dsh-session-persistence-jsonl')
  const { default: WorkspaceRegistry } = await load('@deepseek-ai/dsh-workspace')
  const { default: AgentRegistry } = await load('@deepseek-ai/dsh-agent')
  const entry = process.argv[3] ? pathToFileURL(resolve(process.argv[3])) : new URL('../../packages/mobile/src/session-lifecycle.ts', import.meta.url)
  const { SessionLifecycle } = await import(entry.href)
  const directory = await mkdtemp(join(tmpdir(), 'session-management-smoke-'))
  const ctx = new Context()
  const mount = async (plugin, config) => {
    const fiber = ctx.plugin(plugin, config)
    await fiber.await()
  }
  let lifecycle
  try {
    await mount(Storage)
    await mount(JsonStorage, { root: join(directory, 'storage') })
    await mount(DomainStorage, { backend: 'json' })
    await mount(SessionStore)
    await mount(SessionProjections)
    await mount(Persistence, { root: join(directory, 'sessions') })
    await mount(WorkspaceRegistry)
    await mount(AgentRegistry)
    const id = 'session-offline-native'
    const { z } = await load('zod')
    const cache = await ctx.storageDomain.open(DomainStorage.defineDomain({
      name: 'session_delete_smoke',
      version: 1,
      layout: 'per-record',
      tables: { sessions: DomainStorage.domainTable(z.object({ title: z.string() })) },
    }))
    const table = cache.table('sessions')
    await table.put(id, { title: 'private cached title' })
    ctx.agents.setFactory({
      async createAgent(_owner, options) {
        const session = ctx.sessions.prepare(options.sessionId, { meta: { cwd: directory } })
        const writer = await ctx.sessionPersistence.create(session.header)
        await writer.flush()
        const leave = ctx.sessions.enter(session)
        ctx.sessions.announce(session)
        const agent = { id: options.sessionId, status: 'idle', session }
        const detach = ctx.agents.enter(agent, undefined)
        return {
          agent,
          async dispose() {
            detach()
            leave()
            await writer.close()
          },
        }
      },
    })
    const consumer = ctx.plugin({ name: 'session-management-offline-consumer', inject: ['agents', 'sessions', 'sessionPersistence', 'workspaceRegistry'], apply() {} })
    await consumer.await()
    lifecycle = new SessionLifecycle({
      agents: consumer.ctx.agents,
      sessions: consumer.ctx.sessions,
      sessionPersistence: consumer.ctx.sessionPersistence,
      workspaceRegistry: ctx.workspaceRegistry,
      activity: id => ctx.waterfall('workspace/session-activity', { sessionId: id }, async () => []),
      eraseProjectionCache: id => table.delete(id),
    }, join(directory, 'management.json'))
    await lifecycle.load()
    const handle = await ctx.agents.create({ sessionId: id })
    assert.equal(ctx.agents.get(id), handle.agent)
    const location = ctx.sessionPersistence.locate((await ctx.sessionPersistence.stat(id)).header)
    assert.ok((await readFile(location.path)).length > 0)
    await lifecycle.archive(id, true)
    assert.ok(ctx.workspaceRegistry.archivedSessionIds.includes(id))
    await lifecycle.archive(id, false)
    assert.ok(!ctx.workspaceRegistry.archivedSessionIds.includes(id))
    handle.agent.status = 'running'
    await assert.rejects(() => lifecycle.erase(id, async () => {}), /session_active/)
    handle.agent.status = 'idle'
    await lifecycle.erase(id, async () => {})
    assert.equal(ctx.agents.get(id), undefined)
    assert.equal(ctx.sessions.get(id), undefined)
    assert.equal(await ctx.sessionPersistence.stat(id), undefined)
    assert.equal(lifecycle.deleted(id), true)
    assert.equal(table.get(id), undefined)
    await cache.close()
    await assert.rejects(readFile(location.path))
    await lifecycle.close()
    lifecycle = undefined
    await consumer.dispose()
    const afterReload = await ctx.agents.create({ sessionId: 'session-after-plugin-unload' })
    assert.ok(ctx.agents.get(afterReload.agent.id))
    await afterReload.dispose()
    process.stdout.write(`${JSON.stringify({ realCordis: true, writerDisposed: true, archived: true, restored: true, physicallyDeleted: true, cacheDeleted: true, reloadSafe: true, offline: true })}\n`)
  }
  finally {
    await lifecycle?.close()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
