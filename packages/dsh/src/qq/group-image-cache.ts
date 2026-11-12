import type { QQGroupImageCacheSettings } from './contracts'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, rename, unlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const MIB = 1024 * 1024
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const MAX_IMAGE_MIB = 4
export const GROUP_IMAGE_CACHE_LIMITS = {
  ttlHours: 168,
  maxImageMiB: MAX_IMAGE_MIB,
  maxMiB: 1024,
  maxEntries: 2048,
  cleanupMinutes: 60,
} as const
export const GROUP_IMAGE_MAX_BYTES = MAX_IMAGE_MIB * MIB
export const DEFAULT_GROUP_IMAGE_CACHE = {
  enabled: true,
  ttlHours: 24,
  maxImageMiB: MAX_IMAGE_MIB,
  maxMiB: 128,
  maxEntries: 512,
  cleanupMinutes: 5,
} as const satisfies Required<QQGroupImageCacheSettings>
export const GROUP_IMAGE_TTL_MS = DEFAULT_GROUP_IMAGE_CACHE.ttlHours * HOUR
const CACHE_KEY = /^[a-f0-9]{64}$/u
const TEMP_FILE = /^[a-f0-9]{64}\.[a-f0-9-]{36}\.tmp$/u
interface Entry { at: number, size: number }
export type CacheOptions = Readonly<Required<QQGroupImageCacheSettings>>

export function groupImageCacheOptions(input: unknown): CacheOptions {
  if (input === undefined)
    return DEFAULT_GROUP_IMAGE_CACHE
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('groupImageCache must be a mapping')
  const value = input as Record<string, unknown>
  if (Object.keys(value).some(key => !Object.hasOwn(DEFAULT_GROUP_IMAGE_CACHE, key)))
    throw new TypeError('groupImageCache contains an unknown option')
  const enabled = value.enabled === undefined ? DEFAULT_GROUP_IMAGE_CACHE.enabled : value.enabled
  if (typeof enabled !== 'boolean')
    throw new TypeError('groupImageCache.enabled must be true or false')
  const number = (key: keyof typeof GROUP_IMAGE_CACHE_LIMITS) => {
    const max = GROUP_IMAGE_CACHE_LIMITS[key]
    const valueForKey = value[key] === undefined ? DEFAULT_GROUP_IMAGE_CACHE[key] : value[key]
    if (typeof valueForKey !== 'number' || !Number.isInteger(valueForKey) || valueForKey < 1 || valueForKey > max)
      throw new TypeError(`groupImageCache.${key} must be an integer between 1 and ${max}`)
    return valueForKey
  }
  return {
    enabled,
    ttlHours: number('ttlHours'),
    maxImageMiB: number('maxImageMiB'),
    maxMiB: number('maxMiB'),
    maxEntries: number('maxEntries'),
    cleanupMinutes: number('cleanupMinutes'),
  }
}

/** Only this process writes the private cache directory. The original QQ timestamp is the mtime. */
export class QQGroupImageCache {
  private entries?: Map<string, Entry>
  private size = 0
  private queue = Promise.resolve()
  private cleanup?: { onFailure: () => void, timer?: ReturnType<typeof setInterval> }

  constructor(
    private readonly directory: string,
    private options: CacheOptions = DEFAULT_GROUP_IMAGE_CACHE,
    private readonly now = Date.now,
  ) {}

  get settings(): CacheOptions { return { ...this.options } }
  get enabled() { return this.options.enabled }
  get ttlMs() { return this.options.ttlHours * HOUR }
  private get maxBytes() { return this.options.maxMiB * MIB }
  get maxImageBytes() { return Math.min(this.maxBytes, this.options.maxImageMiB * MIB) }

  start(onFailure: () => void) {
    this.stopCleanup()
    const cleanup = this.cleanup = { onFailure }
    this.scheduleCleanup()
    return () => {
      if (this.cleanup === cleanup)
        this.stopCleanup()
    }
  }

  configure(options: CacheOptions) {
    return this.serial(async () => {
      this.options = options
      if (this.cleanup)
        this.scheduleCleanup()
    })
  }

  private stopCleanup() {
    clearInterval(this.cleanup?.timer)
    this.cleanup = undefined
  }

  private scheduleCleanup() {
    const cleanup = this.cleanup!
    clearInterval(cleanup.timer)
    const sweep = () => this.sweep().catch(cleanup.onFailure)
    void sweep()
    cleanup.timer = setInterval(sweep, this.options.cleanupMinutes * MINUTE)
    cleanup.timer.unref()
  }

  sweep() {
    return this.serial(async () => this.trim(await this.load()))
  }

  get(key: string) {
    return this.serial(async () => {
      if (!this.enabled || !CACHE_KEY.test(key))
        return
      const entries = await this.load()
      const entry = entries.get(key)
      if (!entry)
        return
      if (this.expired(entry) || entry.size > this.maxImageBytes) {
        await this.remove(entries, key)
        return
      }
      try {
        const file = await open(this.path(key), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
        try {
          const stat = await file.stat()
          if (stat.isFile() && stat.size === entry.size && !this.expired(entry)) {
            const { buffer, bytesRead } = await file.read(Buffer.alloc(entry.size))
            if (bytesRead === entry.size && !this.expired(entry))
              return buffer
          }
        }
        finally { await file.close() }
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw error
      }
      await this.remove(entries, key)
    })
  }

  put(key: string, at: number, data: Buffer) {
    return this.serial(async () => {
      if (!this.enabled || !CACHE_KEY.test(key) || !Number.isFinite(at) || !data.length || data.length > this.maxImageBytes)
        return
      const entries = await this.load()
      await this.trim(entries)
      const entry = { at: Math.min(at, this.now()), size: data.length }
      if (this.expired(entry) || entries.has(key))
        return
      if (await this.trim(entries, entry) === false)
        return
      const tmp = join(this.directory, `${key}.${randomUUID()}.tmp`)
      try {
        await writeFile(tmp, data, { mode: 0o600, flag: 'wx' })
        await utimes(tmp, entry.at / 1000, entry.at / 1000)
        await rename(tmp, this.path(key))
        entries.set(key, entry)
        this.size += entry.size
      }
      finally { await unlink(tmp).catch(() => {}) }
    })
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation)
    this.queue = next.then(() => {}, () => {})
    return next
  }

  private path(key: string) { return join(this.directory, `${key}.img`) }
  private expired(entry: Entry) {
    const age = this.now() - entry.at
    return age < 0 || age >= this.ttlMs
  }

  private async load() {
    if (this.entries)
      return this.entries
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    if (!(await lstat(this.directory)).isDirectory())
      throw new Error('Invalid QQ group image cache directory')
    const entries = new Map<string, Entry>()
    let size = 0
    for (const file of await readdir(this.directory, { withFileTypes: true })) {
      if (!file.isFile())
        continue
      const key = file.name.endsWith('.img') ? file.name.slice(0, -4) : ''
      if (CACHE_KEY.test(key)) {
        const stat = await lstat(this.path(key))
        if (!stat.isFile())
          continue
        if (!stat.size || stat.size > GROUP_IMAGE_MAX_BYTES) {
          await unlink(this.path(key))
          continue
        }
        entries.set(key, { at: stat.mtimeMs, size: stat.size })
        size += stat.size
      }
      else if (TEMP_FILE.test(file.name)) {
        await unlink(join(this.directory, file.name))
      }
    }
    this.size = size
    this.entries = entries
    return entries
  }

  private async remove(entries: Map<string, Entry>, key: string) {
    await unlink(this.path(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT')
        throw error
    })
    this.size -= entries.get(key)!.size
    entries.delete(key)
  }

  private async trim(entries: Map<string, Entry>, incoming?: Entry) {
    for (const [key, entry] of entries) {
      if (this.expired(entry) || entry.size > this.maxImageBytes)
        await this.remove(entries, key)
    }
    let bytes = this.size + (incoming?.size ?? 0)
    let count = entries.size + Number(!!incoming)
    if (bytes <= this.maxBytes && count <= this.options.maxEntries)
      return
    const victims: string[] = []
    for (const [key, entry] of [...entries].sort(([, a], [, b]) => a.at - b.at)) {
      // Never evict a newer photo to make room for an older, out-of-order delivery.
      if (incoming && incoming.at < entry.at)
        return false
      victims.push(key)
      bytes -= entry.size
      count--
      if (bytes <= this.maxBytes && count <= this.options.maxEntries)
        break
    }
    for (const key of victims)
      await this.remove(entries, key)
  }
}
