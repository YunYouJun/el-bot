import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { DEFAULT_GROUP_IMAGE_CACHE, groupImageCacheOptions, QQGroupImageCache } from './group-image-cache'

const key = (id: string) => id.repeat(64)
const bytes = Buffer.of(255, 216, 255, 217)
let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'qq-group-image-cache-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

it('restores cached bytes after restart without extending the original expiration', async () => {
  let time = Date.parse('2026-11-13T00:00:00Z')
  const now = () => time
  const options = groupImageCacheOptions({ ttlHours: 2 })
  const cache = new QQGroupImageCache(directory, options, now)
  const path = join(directory, `${key('a')}.img`)
  await cache.put(key('a'), time, bytes)
  expect((await stat(path)).mode & 0o777).toBe(0o600)
  time += 2 * 60 * 60_000 - 100
  const restarted = new QQGroupImageCache(directory, options, now)
  await restarted.put(key('a'), time, bytes)
  expect(await restarted.get(key('a'))).toEqual(bytes)
  time += 100
  await restarted.sweep()
  expect(await restarted.get(key('a'))).toBeUndefined()
  await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('cleans expired and oldest images to enforce the byte budget without touching other files', async () => {
  let time = Date.parse('2026-11-13T00:00:00Z')
  const cache = new QQGroupImageCache(directory, groupImageCacheOptions({ maxMiB: 1 }), () => time)
  const photo = Buffer.alloc(400 * 1024, 3)
  const unmanaged = join(directory, 'unmanaged.json')
  await writeFile(unmanaged, 'keep')
  await cache.put(key('a'), time, photo)
  time++
  await cache.put(key('b'), time, photo)
  time++
  await cache.put(key('c'), time, photo)
  expect(await cache.get(key('a'))).toBeUndefined()
  expect(await cache.get(key('b'))).toHaveLength(photo.length)
  expect(await cache.get(key('c'))).toHaveLength(photo.length)
  await cache.put(key('d'), time - 2, photo)
  expect(await cache.get(key('d'))).toBeUndefined()
  time += 24 * 60 * 60_000
  await cache.put(key('e'), time, bytes)
  await expect(stat(join(directory, `${key('c')}.img`))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await cache.get(key('e'))).toEqual(bytes)
  expect(await readFile(unmanaged, 'utf8')).toBe('keep')
})

it('stops reads and writes when disabled and applies reduced limits to stored files on restart', async () => {
  const time = Date.parse('2026-11-13T00:00:00Z')
  const now = () => time
  const cache = new QQGroupImageCache(directory, undefined, now)
  const large = Buffer.alloc(2 * 1024 * 1024, 4)
  await cache.put(key('a'), time, large)
  const path = join(directory, `${key('a')}.img`)
  const disabled = new QQGroupImageCache(directory, groupImageCacheOptions({ enabled: false }), now)
  expect(await disabled.get(key('a'))).toBeUndefined()
  await disabled.put(key('b'), time, bytes)
  await expect(stat(join(directory, `${key('b')}.img`))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await stat(path)).size).toBe(large.length)
  const smaller = new QQGroupImageCache(directory, groupImageCacheOptions({ maxImageMiB: 1 }), now)
  await smaller.sweep()
  await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects mistyped or unbounded settings and accepts partial overrides', () => {
  expect(groupImageCacheOptions({ cleanupMinutes: 10 })).toEqual({ ...DEFAULT_GROUP_IMAGE_CACHE, cleanupMinutes: 10 })
  expect(() => groupImageCacheOptions({ enabled: 'false' })).toThrow('groupImageCache.enabled')
  expect(() => groupImageCacheOptions({ ttlHours: 169 })).toThrow('groupImageCache.ttlHours')
  expect(() => groupImageCacheOptions({ maxImageMiB: 5 })).toThrow('groupImageCache.maxImageMiB')
  expect(() => groupImageCacheOptions({ maxMb: 128 })).toThrow('unknown option')
})
