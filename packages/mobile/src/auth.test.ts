import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { DeviceStore } from './auth'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function create(now = Date.now) {
  const directory = await mkdtemp(join(tmpdir(), 'yun-bot-mobile-'))
  directories.push(directory)
  const path = join(directory, 'devices.json')
  const store = new DeviceStore(path, now)
  await store.load()
  return { store, path }
}

it('admits a pairing code once even under concurrent exchanges and stores only hashes', async () => {
  const { store, path } = await create()
  const pairing = await store.createPairing()
  const results = await Promise.allSettled([store.exchange(pairing.code, 'iPhone'), store.exchange(pairing.code, 'other')])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const accepted = results.find(result => result.status === 'fulfilled')
  if (!accepted || accepted.status !== 'fulfilled')
    throw new Error('Pairing was not accepted')
  const { token, device } = accepted.value
  expect(store.authorize(`Bearer ${token}`)?.id).toBe(device.id)
  const persisted = await readFile(path, 'utf8')
  expect(persisted).not.toContain(token)
  expect(persisted).not.toContain(pairing.code.replace('-', ''))
  if (process.platform !== 'win32')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  const restored = new DeviceStore(path)
  await restored.load()
  expect(restored.authorize(`Bearer ${token}`)?.id).toBe(device.id)
  await restored.revoke(device.id)
  expect(restored.authorize(`Bearer ${token}`)).toBeUndefined()
})

it('expires pairing codes and device credentials without deleting their saved state', async () => {
  let now = Date.now()
  const { store, path } = await create(() => now)
  const old = await store.createPairing()
  now += 5 * 60_000
  await expect(store.exchange(old.code, 'iPhone')).rejects.toThrow('invalid_pairing')
  const current = await store.createPairing()
  const { token } = await store.exchange(current.code, 'iPhone')
  now += 30 * 24 * 60 * 60_000
  expect(store.authorize(`Bearer ${token}`)).toBeUndefined()
  expect(await readFile(path, 'utf8')).toContain('tokenHash')
})

it('accepts the smart dash inserted by an iPhone keyboard', async () => {
  const { store } = await create()
  const pairing = await store.createPairing()
  const paired = await store.exchange(pairing.code.replace('-', '–'), 'iPhone')
  expect(store.authorize(`Bearer ${paired.token}`)?.name).toBe('iPhone')
})

it('limits guessing attempts and refuses corrupt state instead of replacing it', async () => {
  const { store, path } = await create()
  for (let i = 0; i < 20; i++)
    await expect(store.exchange('AAAAAAAA', 'iPhone')).rejects.toThrow('invalid_pairing')
  await expect(store.exchange('AAAAAAAA', 'iPhone')).rejects.toThrow('pairing_rate_limited')
  await writeFile(path, '{invalid')
  await expect(new DeviceStore(path).load()).rejects.toThrow()
  expect(await readFile(path, 'utf8')).toBe('{invalid')
})
