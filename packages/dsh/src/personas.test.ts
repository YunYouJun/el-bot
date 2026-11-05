import type { ManagedQQ, PersonaContext } from './contracts'
import type { PeerRecord, Scope } from './qq-workspaces/contracts'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PersonaAdmission } from './admission'
import { personaRoutes } from './http'
import { PersonaService } from './service'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function service() {
  const path = await mkdtemp(join(tmpdir(), 'el-dsh-personas-'))
  temporary.push(path)
  return new PersonaService({ profileDirectory: path, title: '小云 Bot' })
}
const input = { kind: 'text' as const, name: 'xiaoyun.md', text: '---\nid: xiaoyun\nname: 小云\n---\n你是戴着云朵发饰的小云。' }

function manager() {
  const records = new Map<string, PeerRecord>()
  const history: PeerRecord[] = []
  const value: ManagedQQ = {
    sessionKey: (scope, peer) => `qqbot:test:${scope}:${peer}`,
    async getOrCreate(scope: Scope, peerId: string) {
      const key = value.sessionKey(scope, peerId)
      const existing = records.get(key)
      if (existing)
        return existing
      const sessionId = `session-${history.length + 1}`
      const record: PeerRecord = { scope, peerId, sessionKey: key, sessionId, agent: { status: 'idle', session: { header: { id: sessionId } }, whenIdle: async () => {} } }
      records.set(key, record)
      history.push(record)
      return record
    },
    async remove(scope, peer) {
      const key = value.sessionKey(scope, peer)
      if (records.get(key)?.agent.status !== 'idle')
        throw new Error('Attempted to cancel a running task')
      records.delete(key)
    },
    findByAgent: agent => history.find(record => record.agent === agent),
  }
  return { value, history, get: () => value.getOrCreate('c2c', 'owner', 'owner', { scope: 'c2c', targetId: 'owner', msgId: 'test' }) }
}

describe('dSH character cards', () => {
  it('shares one persisted selection between the Web module and SSH shortcut, while isolating profiles', async () => {
    const web = await service()
    const imported = await web.request({ operation: 'import', input }, true)
    const hash = imported.preview!.hash
    await web.request({ operation: 'use', id: 'xiaoyun', revision: hash }, true)
    const ssh = new PersonaService(web.settings)
    expect((await ssh.request({ operation: 'list' })).library.active).toEqual({ id: 'xiaoyun', hash })
    expect((await (await service()).request({ operation: 'list' })).library.cards).toEqual([])
    await ssh.request({ operation: 'disable' })
    expect((await web.request({ operation: 'list' })).library.active).toBeUndefined()
    await expect(web.request({ operation: 'import', input: { kind: 'file', path: '/etc/passwd' } }, true)).rejects.toThrow('文件选择器')
    await expect(web.request({ operation: 'import', input: { kind: 'git', repository: '/tmp/repo', path: 'card.md' } }, true)).rejects.toThrow('HTTPS')
  })

  it('starts a fresh QQ session for a changed persona, preserves history, and freezes an admitted running task', async () => {
    const cards = await service()
    const admission = new PersonaAdmission(cards)
    const qq = manager()
    admission.attach(qq.value)
    const initial = await qq.get()
    expect(admission.context(initial.agent)).toBeUndefined()
    initial.agent.status = 'running'
    await cards.request({ operation: 'import', input })
    await cards.request({ operation: 'use', id: 'xiaoyun' })
    expect(await qq.get()).toBe(initial)
    expect(admission.context(initial.agent)).toBeUndefined()
    initial.agent.status = 'idle'
    const selected = await qq.get()
    expect(selected.sessionId).not.toBe(initial.sessionId)
    expect(qq.history).toContain(initial)
    expect(admission.context(selected.agent)).toContain('云朵发饰')
    expect(admission.context({})).toBeUndefined()
    selected.agent.status = 'running'
    await cards.request({ operation: 'disable' })
    expect(await qq.get()).toBe(selected)
    expect(admission.context(selected.agent)).toContain('云朵发饰')
    selected.agent.status = 'idle'
    const [a, b] = await Promise.all([qq.get(), qq.get()])
    expect(a).toBe(b)
    expect(a.sessionId).not.toBe(selected.sessionId)
    expect(admission.context(a.agent)).toBeUndefined()
  })

  it('restores the admission binding after a plugin restart and fails closed on corrupt bindings', async () => {
    const cards = await service()
    await cards.request({ operation: 'import', input })
    await cards.request({ operation: 'use', id: 'xiaoyun' })
    const qq = manager()
    const admission = new PersonaAdmission(cards)
    const detach = admission.attach(qq.value)
    const record = await qq.get()
    detach()
    const restarted = new PersonaAdmission(new PersonaService(cards.settings))
    const stop = restarted.attach(qq.value)
    expect(await qq.get()).toBe(record)
    expect(restarted.context(record.agent)).toBe(admission.context(record.agent))
    stop()
    await writeFile(join(cards.library.directory, 'sessions.json'), '{corrupt')
    const broken = new PersonaAdmission(cards)
    broken.attach(qq.value)
    await expect(qq.get()).rejects.toThrow('记录损坏')
  })

  it('requires host owner authentication and an explicit mutation header before touching the shared library', async () => {
    const cards = await service()
    let handler: Parameters<PersonaContext['webServer']['register']>[0]['handler'] | undefined
    personaRoutes({
      webServer: { register: (route) => {
        handler = route.handler
        return () => {}
      } },
      connection: { requestRejection: req => req.headers.origin === 'https://other.test' ? 403 : req.headers.cookie !== 'owner=ok' ? 401 : undefined },
      get: () => undefined,
      provide: () => {},
      on: () => () => {},
      effect: () => {},
    }, cards)
    const server = createServer((req, res) => {
      void handler!(req, res)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('No test HTTP address')
    const url = `http://127.0.0.1:${address.port}/el-bot/personas/api`
    try {
      expect((await fetch(url)).status).toBe(401)
      expect((await fetch(url, { headers: { cookie: 'owner=ok', origin: 'https://other.test' } })).status).toBe(403)
      const headers = { 'cookie': 'owner=ok', 'content-type': 'application/json' }
      const body = JSON.stringify({ operation: 'import', input })
      expect((await fetch(url, { method: 'POST', headers, body })).status).toBe(405)
      expect((await cards.library.list()).cards).toHaveLength(0)
      const imported = await fetch(url, { method: 'POST', headers: { ...headers, 'x-el-bot-persona': '1' }, body })
      expect(imported.status).toBe(200)
      expect(await imported.json()).toMatchObject({ result: { preview: { metadata: { name: '小云' } } } })
      expect((await fetch(url, { headers })).status).toBe(200)
    }
    finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
  })
})
