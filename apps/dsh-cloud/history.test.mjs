import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { it } from 'vitest'
import { FileHistoryStore, persistHistory } from './history.mjs'

it('retains bounded, deduplicated unmentioned context across restarts and clears completed context', () => {
  const directory = mkdtempSync(join(tmpdir(), 'qq-history-'))
  try {
    const now = 100_000_000
    const store = new FileHistoryStore(directory, () => now)
    const entry = id => ({ senderId: 'owner', messageId: id, content: 'a'.repeat(5000), timestamp: now })
    store.append('123:room', entry('one'), 2)
    store.append('123:room', entry('one'), 2)
    store.append('123:room', entry('two'), 2)
    store.append('123:room', entry('three'), 2)
    const resumed = new FileHistoryStore(directory, () => now)
    assert.deepEqual(resumed.list('123:room', 2).map(item => item.messageId), ['two', 'three'])
    assert.equal(resumed.list('123:room', 2)[0].content.length, 4000)
    if (process.platform !== 'win32')
      assert.equal(statSync(store.path('123:room')).mode & 0o777, 0o600)
    assert.deepEqual(new FileHistoryStore(directory, () => now + 86_400_001).list('123:room', 2), [])
    resumed.clear('123:room')
    assert.deepEqual(new FileHistoryStore(directory).list('123:room', 2), [])
  }
  finally { rmSync(directory, { recursive: true, force: true }) }
})

it('keeps other bot stores untouched and refuses to overwrite corrupt persisted context', () => {
  const directory = mkdtempSync(join(tmpdir(), 'qq-history-'))
  try {
    const memory = {
      append() {},
      list() { return ['foreign'] },
      clear() {},
    }
    const original = memory.list
    const dispose = persistHistory(memory, '123', directory)
    assert.deepEqual(memory.list('456:room', 5), ['foreign'])
    const file = new FileHistoryStore(directory).path('123:room')
    writeFileSync(file, 'corrupt', { mode: 0o600 })
    assert.throws(() => memory.append('123:room', { content: 'new' }, 5))
    assert.equal(readFileSync(file, 'utf8'), 'corrupt')
    dispose()
    assert.equal(memory.list, original)
  }
  finally { rmSync(directory, { recursive: true, force: true }) }
})
