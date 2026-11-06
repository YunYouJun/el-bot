import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { it } from 'vitest'
import { monitorBot, runtimeReady } from './health.mjs'

it('a reachable Web listener cannot hide absent, stale or disconnected QQ state', () => {
  const boot = { id: 'this-boot' }
  const grouped = { phase: 'ready' }
  assert.equal(runtimeReady(boot, undefined, grouped), false)
  assert.equal(runtimeReady(boot, { bootId: 'previous-boot', connected: true }, grouped), false)
  assert.equal(runtimeReady(boot, { bootId: boot.id, connected: false }, grouped), false)
  assert.equal(runtimeReady(boot, { bootId: boot.id, connected: true }, { phase: 'loading' }), false)
  assert.equal(runtimeReady(boot, { bootId: boot.id, connected: true }, grouped), true)
})

it('public QQ lifecycle events mark ready, disconnect, resume and stop for the bound bot', async () => {
  class Bot extends EventEmitter {
    constructor(appId) {
      super()
      this.appId = appId
    }

    async start() {}
    stop() {}
  }
  const states = []
  const original = Bot.prototype.start
  const dispose = monitorBot(Bot.prototype, '123', state => states.push(state))
  try {
    const foreign = new Bot('456')
    await foreign.start()
    assert.equal(states.length, 0)
    const bot = new Bot('123')
    await bot.start()
    assert.equal(states.at(-1).connected, false)
    bot.emit('ready')
    assert.equal(states.at(-1).connected, true)
    bot.emit('disconnected', { code: 4009 })
    assert.equal(states.at(-1).connected, false)
    bot.emit('resumed')
    assert.equal(states.at(-1).connected, true)
    bot.stop()
    assert.equal(states.at(-1).connected, false)
    dispose()
    assert.equal(Bot.prototype.start, original)
    assert.equal(bot.listenerCount('ready'), 0)
  }
  finally { dispose() }
})
