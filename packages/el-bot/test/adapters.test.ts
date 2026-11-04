import type { BotAdapter, MessageContext } from '../core/adapter'
import { describe, expect, it, vi } from 'vitest'
import { AdapterRegistry } from '../core/bot/adapters'

function message(): MessageContext {
  return {
    adapterId: 'work',
    platform: 'wecom',
    accountId: 'bot',
    id: 'message',
    text: 'hello',
    sender: { id: 'owner' },
    chat: { id: 'owner', type: 'dm' },
    addressed: true,
    reply: vi.fn().mockResolvedValue(undefined),
  }
}

describe('platform adapter lifecycle', () => {
  it('rolls back failed startup in reverse order, including the partially started connection', async () => {
    const calls: string[] = []
    const registry = new AdapterRegistry()
    for (const id of ['first', 'second']) {
      registry.register({
        id,
        platform: 'test',
        start() {
          calls.push(`start:${id}`)
          if (id === 'second')
            throw new Error('cannot connect')
        },
        stop() { calls.push(`stop:${id}`) },
      })
    }
    await expect(registry.start(vi.fn())).rejects.toThrow('cannot connect')
    expect(calls).toEqual(['start:first', 'start:second', 'stop:second', 'stop:first'])
    expect(() => registry.clear()).not.toThrow()
  })

  it('cleans up all connections even if one stop fails', async () => {
    const registry = new AdapterRegistry()
    const stop = vi.fn()
    registry.register({ id: 'one', platform: 'test', start() {}, stop })
    registry.register({
      id: 'two',
      platform: 'test',
      start() {},
      stop() { throw new Error('stop failed') },
    })
    await registry.start(vi.fn())
    await expect(registry.stop()).rejects.toThrow('Failed to stop platform adapters')
    expect(stop).toHaveBeenCalledTimes(1)
    expect(() => registry.clear()).not.toThrow()
  })

  it('coalesces starts, rejects late messages after stop, and fences previous connections on restart', async () => {
    const registry = new AdapterRegistry()
    const receivers: ((message: MessageContext) => Promise<void>)[] = []
    const adapter: BotAdapter = {
      id: 'work',
      platform: 'wecom',
      stop: vi.fn(),
      start: vi.fn((dispatch) => {
        receivers.push(dispatch)
      }),
    }
    registry.register(adapter)
    const dispatch = vi.fn()
    await Promise.all([registry.start(dispatch), registry.start(dispatch)])
    expect(adapter.start).toHaveBeenCalledTimes(1)
    await receivers[0](message())
    await registry.stop()
    await receivers[0](message())
    expect(dispatch).toHaveBeenCalledTimes(1)
    await registry.start(dispatch)
    await receivers[0](message())
    await receivers[1](message())
    expect(dispatch).toHaveBeenCalledTimes(2)
    await registry.stop()
  })

  it('routes sends by adapter identity and rejects unsupported or inactive targets', async () => {
    const registry = new AdapterRegistry()
    const send = vi.fn().mockResolvedValue('sent')
    registry.register({ id: 'work', platform: 'wecom', start() {}, stop() {}, send })
    registry.register({ id: 'qq', platform: 'qq', start() {}, stop() {} })
    const target = { id: 'owner', type: 'dm' as const }
    await expect(registry.send('work', target, 'hello')).rejects.toThrow('not running')
    await registry.start(vi.fn())
    await expect(registry.send('work', target, 'hello')).resolves.toBe('sent')
    expect(send).toHaveBeenCalledExactlyOnceWith(target, 'hello')
    await expect(registry.send('qq', target, 'hello')).rejects.toThrow('does not support proactive')
    await expect(registry.send('unknown', target, 'hello')).rejects.toThrow('not running')
    await registry.stop()
  })
})
