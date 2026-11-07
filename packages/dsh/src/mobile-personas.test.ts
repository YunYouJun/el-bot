import type { MobileHost } from '../../mobile/src/types'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { DeviceStore } from '../../mobile/src/auth'
import { API_PATH, mobileRoutes } from '../../mobile/src/http'
import { PersonaService } from './service'

it('shares mobile imports and pinned selections with DSH while enforcing device and import boundaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'el-mobile-personas-'))
  const service = new PersonaService({ profileDirectory: directory, title: 'Test bot' })
  const request = vi.spyOn(service, 'request')
  const devices = new DeviceStore(join(directory, 'devices.json'))
  await devices.load()
  const paired = await devices.exchange((await devices.createPairing()).code, 'Test phone')
  const host: MobileHost = {
    list: async () => [],
    conversation: async () => { throw new Error('unused') },
    models: async () => ({ groups: [] }),
    selectModel: async (_id, route) => route,
    prompt: async () => {},
    create: async () => 'unused',
    status: async () => ({ name: 'Test', appId: 'test', state: 'online', checkedAt: new Date().toISOString() }),
  }
  let installed = true
  const server = createServer(mobileRoutes(host, devices, 'https://bot.example.test', () => {}, undefined, undefined, undefined, () => installed ? service : undefined))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No test listener')
  const url = `http://127.0.0.1:${address.port}${API_PATH}/personas`
  const headers = { 'authorization': `Bearer ${paired.token}`, 'content-type': 'application/json' }
  const post = (value: unknown) => fetch(url, { method: 'POST', headers, body: JSON.stringify(value) })
  const input = { kind: 'text', name: 'cloud.md', text: '---\nid: cloud\nname: Cloud\n---\nFirst version' }
  try {
    expect((await fetch(url)).status).toBe(401)
    expect(request).not.toHaveBeenCalled()
    expect((await fetch(url, { headers: { ...headers, origin: 'https://other.example' } })).status).toBe(403)
    expect(request).not.toHaveBeenCalled()
    installed = false
    expect((await fetch(url, { headers })).status).toBe(503)
    installed = true
    expect(await (await fetch(url, { headers })).json()).toMatchObject({ library: { version: 1, cards: [] } })

    const firstImport = await post({ operation: 'import', input })
    expect(firstImport.status).toBe(200)
    const first = await firstImport.json() as { preview: { hash: string } }
    expect(request).toHaveBeenLastCalledWith({ operation: 'import', input }, true)
    expect((await service.library.list()).active).toBeUndefined()
    expect((await post({ operation: 'use', id: 'cloud', revision: first.preview.hash })).status).toBe(200)
    expect((await service.library.list()).active).toEqual({ id: 'cloud', hash: first.preview.hash })

    // A new version changes the latest card without silently changing the active snapshot.
    const secondImport = await post({ operation: 'import', input: { ...input, text: input.text.replace('First', 'Second') } })
    expect(secondImport.status).toBe(200)
    const second = await secondImport.json() as { preview: { hash: string } }
    expect(second.preview.hash).not.toBe(first.preview.hash)
    expect((await service.library.list()).active?.hash).toBe(first.preview.hash)
    expect(await (await post({ operation: 'preview', id: 'cloud', revision: first.preview.hash })).json()).toMatchObject({ preview: { body: 'First version' } })
    await service.request({ operation: 'use', id: 'cloud', revision: second.preview.hash })
    expect(await (await fetch(url, { headers })).json()).toMatchObject({ library: { active: { hash: second.preview.hash } } })
    expect((await post({ operation: 'use', id: 'cloud', revision: first.preview.hash })).status).toBe(200)
    expect((await service.library.list()).active?.hash).toBe(first.preview.hash)
    expect((await post({ operation: 'disable' })).status).toBe(200)
    expect((await service.library.list()).active).toBeUndefined()

    const calls = request.mock.calls.length
    for (const value of [
      { operation: 'delete', id: 'cloud' },
      { operation: 'use', id: '../cloud' },
      { operation: 'preview', id: 'cloud', revision: {} },
      { operation: 'import', input: { kind: 'file', path: '/etc/passwd' } },
      { operation: 'import', input: { kind: 'url', url: 'http://example.com/card.md' } },
      { operation: 'import', input: { kind: 'url', url: 'https://user:password@example.com/card.md' } },
      { operation: 'import', input: { kind: 'git', repository: '/tmp/repo', path: 'card.md' } },
      { operation: 'import', input: { kind: 'git', repository: 'https://example.com/repo', path: '../card.md' } },
      { operation: 'import', input: { kind: 'git', repository: 'https://example.com/repo', path: 'card.md', ref: '--upload-pack=x' } },
    ]) {
      expect((await post(value)).status).toBe(400)
    }
    expect(request).toHaveBeenCalledTimes(calls)
    expect((await post({ operation: 'import', input: { ...input, text: '云'.repeat(11000) } })).status).toBe(413)
    expect((await fetch(url, { method: 'POST', headers: { authorization: headers.authorization }, body: '{}' })).status).toBe(415)
    expect((await fetch(url, { method: 'DELETE', headers })).status).toBe(405)
    expect((await post({ operation: 'use', id: 'missing' })).status).toBe(400)

    // A card larger than the normal API body limit is allowed, including JSON-escaped content.
    const escaped = { ...input, text: input.text + '\n'.repeat(30 * 1024) }
    expect((await post({ operation: 'import', input: escaped })).status).toBe(200)
    expect((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ operation: 'list', padding: 'x'.repeat(256 * 1024) }) })).status).toBe(413)
    await devices.revoke(paired.device.id)
    expect((await post({ operation: 'disable' })).status).toBe(401)
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})
