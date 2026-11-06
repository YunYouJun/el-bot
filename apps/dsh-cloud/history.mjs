import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Only pending group context belongs here. Completed turns remain in DSH logs.
export class FileHistoryStore {
  constructor(directory, now = Date.now) {
    this.directory = directory
    this.now = now
  }

  path(key) {
    return join(this.directory, `${createHash('sha256').update(key).digest('hex')}.json`)
  }

  list(key, limit) {
    const path = this.path(key)
    if (!existsSync(path))
      return []
    if (statSync(path).size > 2 * 1024 * 1024)
      throw new Error('QQ pending history exceeds its storage limit')
    const document = JSON.parse(readFileSync(path, 'utf8'))
    if (document.version !== 1 || document.key !== key || !Array.isArray(document.entries)
      || document.entries.some(entry => typeof entry.messageId !== 'string' || typeof entry.senderId !== 'string'
        || typeof entry.content !== 'string' || !Number.isFinite(entry.timestamp))) {
      throw new Error('Invalid QQ pending history; existing data was retained')
    }
    return document.entries.filter(entry => entry.timestamp >= this.now() - 24 * 60 * 60 * 1000)
      .slice(-this.limit(limit))
  }

  limit(value) {
    return Math.min(100, Math.max(1, Number.isFinite(value) ? Math.floor(value) : 50))
  }

  append(key, entry, limit) {
    const entries = this.list(key, limit)
    if (entries.some(item => item.messageId === entry.messageId))
      return
    entries.push({ ...entry, content: entry.content.slice(0, 4000) })
    const path = this.path(key)
    const temporary = `${path}.${randomUUID()}.tmp`
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    try {
      writeFileSync(temporary, `${JSON.stringify({ version: 1, key, entries: entries.slice(-this.limit(limit)) })}\n`, { flag: 'wx', mode: 0o600 })
      renameSync(temporary, path)
    }
    finally {
      if (existsSync(temporary))
        unlinkSync(temporary)
    }
  }

  clear(key) {
    const path = this.path(key)
    if (existsSync(path))
      unlinkSync(path)
  }
}

export function persistHistory(store, appId, directory) {
  const durable = new FileHistoryStore(directory)
  const originals = { append: store.append, list: store.list, clear: store.clear }
  for (const method of Object.keys(originals)) {
    if (typeof originals[method] !== 'function')
      throw new Error(`Unsupported QQ history store: missing ${method}`)
    store[method] = function (key, ...args) {
      return key.startsWith(`${appId}:`)
        ? durable[method](key, ...args)
        : originals[method].call(this, key, ...args)
    }
  }
  return () => Object.assign(store, originals)
}
