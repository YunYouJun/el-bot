import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { groupImageCacheOptions, QQGroupImageCache } from './group-image-cache'
import { groupImageCacheIntent, QQGroupImageCacheControl } from './group-image-cache-control'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'qq-cache-control-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

async function requestedCode(control: QQGroupImageCacheControl, hours: number) {
  const args = groupImageCacheIntent(`把群图缓存改成 ${hours} 小时`)
  const result = await control.command(args!.slice(1))
  if (typeof result === 'string' || !result.keyboard)
    throw new Error('Expected a confirmation card')
  return result.keyboard.content.rows[0].buttons[0].action.data.split(':').at(-1)!
}

it('extends live retention only after approval and restores just the changed field before startup cleanup', async () => {
  const saved = join(directory, 'settings.json')
  const images = join(directory, 'cache')
  let time = Date.parse('2026-11-13T00:00:00Z')
  const now = () => time
  const cache = new QQGroupImageCache(images, groupImageCacheOptions({ maxEntries: 42 }), now)
  const control = new QQGroupImageCacheControl(saved, '123', 'owner', cache, now)
  const key = 'a'.repeat(64)
  const photo = Buffer.of(255, 216, 255, 217)
  await cache.put(key, time, photo)
  time += 23 * 60 * 60_000
  const code = await requestedCode(control, 48)
  expect(cache.settings.ttlHours).toBe(24)
  await expect(stat(saved)).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await control.button('confirm', code)).accepted).toBe(true)
  expect(cache.settings).toMatchObject({ ttlHours: 48, maxEntries: 42 })
  expect((await control.button('confirm', code)).accepted).toBe(false)
  expect((await stat(saved)).mode & 0o777).toBe(0o600)
  time += 2 * 60 * 60_000
  expect(await cache.get(key)).toEqual(photo)

  const restarted = new QQGroupImageCache(images, groupImageCacheOptions({ maxEntries: 64 }), now)
  const reloaded = new QQGroupImageCacheControl(saved, '123', 'owner', restarted, now)
  await reloaded.load(() => {
    throw new Error('Could not load valid settings')
  })
  await restarted.sweep()
  expect(await restarted.get(key)).toEqual(photo)
  expect(restarted.settings).toMatchObject({ ttlHours: 48, maxEntries: 64 })
})

it('does not apply cancelled, superseded or expired cards, or overwrite a mismatched owner file', async () => {
  const path = join(directory, 'settings.json')
  let time = 0
  const now = () => time
  const cache = new QQGroupImageCache(join(directory, 'cache'))
  const control = new QQGroupImageCacheControl(path, '123', 'owner', cache, now)
  const older = await requestedCode(control, 48)
  const current = await requestedCode(control, 72)
  expect((await control.button('confirm', older)).accepted).toBe(false)
  expect((await control.button('cancel', current)).accepted).toBe(true)
  expect((await control.button('confirm', current)).accepted).toBe(false)
  const expiring = await requestedCode(control, 48)
  time += 10 * 60_000
  expect((await control.button('confirm', expiring)).accepted).toBe(false)
  expect(cache.settings.ttlHours).toBe(24)

  const otherOwner = JSON.stringify({ version: 1, appId: '123', owner: 'someone-else', overrides: { ttlHours: 96 } })
  await writeFile(path, otherOwner, { mode: 0o600 })
  const reloaded = new QQGroupImageCacheControl(path, '123', 'owner', cache, now)
  await reloaded.load(() => {})
  expect(await reloaded.command(['set', 'ttlHours', '48'])).toContain('暂不可修改')
  expect(await readFile(path, 'utf8')).toBe(otherOwner)
  expect(cache.settings.ttlHours).toBe(24)
})
