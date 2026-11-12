import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { DOWNSTREAM_COMMANDS } from '../qq-commands/builtins'
import { QQCommandRegistry } from '../qq-commands/registry'
import { QQCreate } from './create'
import { QQGroupImageCache } from './group-image-cache'
import { QQGroupImageCacheControl } from './group-image-cache-control'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'qq-create-'))
  dirs.push(directory)
  let time = 0
  const now = () => time
  const file = join(directory, 'shortcuts.json')
  const cache = new QQGroupImageCache(join(directory, 'images'))
  const settings = new QQGroupImageCacheControl(join(directory, 'settings.json'), '123', 'owner', cache, now)
  const registry = new QQCommandRegistry({ catalog: DOWNSTREAM_COMMANDS })
  registry.command('help').action(() => 'built in')
  const create = new QQCreate(file, '123', 'owner', registry, settings, now)
  return { create, file, registry, settings, cache, now, advance: (ms: number) => {
    time += ms
  } }
}

function code(card: Awaited<ReturnType<QQCreate['command']>>) {
  if (typeof card === 'string' || !card.keyboard)
    throw new Error('Expected approval card')
  return card.keyboard.content.rows[0].buttons[0].action.data.split(':').at(-1)!
}

it('activates only confirmed data shortcuts and restores them without a creative session', async () => {
  const f = await fixture()
  expect(await f.create.command(['reply', 'hello', '你好'])).toContain('先私聊发送 /create')
  expect(f.create.natural('加个 /hello，固定回复「你好」')).toBeUndefined()
  await f.create.command([])
  const card = await f.create.command(f.create.natural('加个 /hello，固定回复「你好 **世界**」')!)
  expect(f.create.shortcut('hello')).toBeUndefined()
  await expect(stat(f.file)).rejects.toMatchObject({ code: 'ENOENT' })
  const token = code(card)
  expect((await f.create.button('confirm', token)).accepted).toBe(true)
  expect((await f.create.button('confirm', token)).accepted).toBe(false)
  expect((await stat(f.file)).mode & 0o777).toBe(0o600)
  expect(JSON.parse(await readFile(f.file, 'utf8')).shortcuts).toEqual([{ name: 'hello', kind: 'reply', text: '你好 **世界**' }])
  const restarted = new QQCreate(f.file, '123', 'owner', f.registry, f.settings, f.now)
  await restarted.load(() => {
    throw new Error('Invalid saved shortcut')
  })
  expect(restarted.natural('加个 /cache，查看群图缓存')).toBeUndefined()
  expect(restarted.shortcut('hello')).toMatchObject({ scope: 'c2c', permission: 'owner' })
  f.registry.command('hello').action(() => 'plugin')
  expect(restarted.shortcut('hello')).toBeUndefined()
  await restarted.command([])
  const removal = code(await restarted.command(['remove', '/hello']))
  expect((await restarted.button('confirm', removal)).accepted).toBe(true)
  expect(JSON.parse(await readFile(f.file, 'utf8')).shortcuts).toEqual([])
  expect(f.registry.resolve('hello')).toBeDefined()
})

it('rejects reserved names, late conflicts, superseded drafts and expired mode drafts', async () => {
  const f = await fixture()
  await f.create.command([])
  expect(await f.create.command(['shortcut', 'reset'])).toContain('已被使用')
  expect(await f.create.command(['shortcut', 'help'])).toContain('已被使用')
  const stale = code(await f.create.command(['shortcut', 'cache']))
  const conflict = code(await f.create.command(['shortcut', 'settings']))
  expect((await f.create.button('confirm', stale)).accepted).toBe(false)
  f.registry.command('settings').action(() => 'plugin')
  expect((await f.create.button('confirm', conflict)).accepted).toBe(false)
  const expiring = code(await f.create.command(['shortcut', 'cache']))
  f.advance(10 * 60_000)
  expect((await f.create.button('confirm', expiring)).accepted).toBe(false)
  f.advance(5 * 60_000)
  expect(f.create.natural('加个 /cache，查看群图缓存')).toBeUndefined()
  await expect(stat(f.file)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('binds a cache-setting card to its creative session and invalidates it on exit', async () => {
  const f = await fixture()
  await f.create.command([])
  const invalidated = code(await f.create.command(f.create.natural('把群图缓存改成 48 小时')!))
  await f.create.command(['exit'])
  await f.create.command([])
  expect((await f.settings.button('confirm', invalidated)).accepted).toBe(false)
  const confirm = code(await f.create.command(['config', 'ttlHours', '48']))
  expect(f.cache.settings.ttlHours).toBe(24)
  expect((await f.settings.button('confirm', confirm)).accepted).toBe(true)
  expect(f.cache.settings.ttlHours).toBe(48)
})
