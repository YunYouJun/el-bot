import type { CommandCatalogOptions } from './catalog'
import { describe, expect, it } from 'vitest'
import { CommandCatalog } from './catalog'

interface Payload {
  readonly id: string
  description: string
  examples: string[]
}

function payload(id: string, description = id): Payload {
  return { id, description, examples: [] }
}

function catalog(options: CommandCatalogOptions<Payload> = {}) {
  return new CommandCatalog<Payload>({
    describe: command => ({
      description: command.description,
      examples: command.examples,
      hidden: false,
    }),
    ...options,
  })
}

describe('command catalog', () => {
  it('keeps independent instances and registration order', () => {
    const first = catalog()
    const second = catalog()
    const alpha = payload('alpha')
    const beta = payload('beta')
    first.register({ name: 'alpha', aliases: ['a'], payload: alpha })
    first.register({ name: 'beta', payload: beta })

    expect(first.resolve('alpha')).toBe(alpha)
    expect(first.resolve('a')).toBe(alpha)
    expect(first.resolve('beta')).toBe(beta)
    expect(second.resolve('alpha')).toBeUndefined()
    expect(first.list().map(entry => entry.name)).toEqual(['alpha', 'beta'])
    expect(first.list()[0]!.aliases).toEqual(['a'])
  })

  it('normalizes registration and lookup with runtime-specific rules', () => {
    const chinese = catalog({ normalize: name => name.trim() })
    chinese.register({ name: ' 帮助 ', payload: payload('help') })
    chinese.register({ name: 'Help', payload: payload('capital') })
    expect(chinese.resolve('帮助')).toBeTruthy()
    expect(chinese.resolve(' help ')).toBeUndefined()
    expect(chinese.resolve('Help')).toBeTruthy()

    const qq = catalog({ normalize: name => name.trim().replace(/^\//u, '').toLowerCase() })
    const command = payload('echo')
    qq.register({ name: 'Echo', aliases: ['REPEAT'], payload: command })
    expect(qq.resolve('echo')).toBe(command)
    expect(qq.resolve('/EcHo')).toBe(command)
    expect(qq.resolve('repeat')).toBe(command)
    expect(qq.list()[0]!.name).toBe('echo')
    expect(qq.list()[0]!.aliases).toEqual(['repeat'])
  })

  it('rejects duplicate canonical names, aliases and reserved names atomically', () => {
    const commands = catalog({ reserved: ['new'] })
    const original = payload('original')
    commands.register({ name: 'echo', aliases: ['repeat'], payload: original })

    expect(() => commands.register({ name: 'echo', payload: payload('duplicate') })).toThrow('already exists')
    expect(() => commands.register({ name: 'other', aliases: ['repeat'], payload: payload('alias') })).toThrow('already exists')
    expect(() => commands.register({ name: 'repeat', payload: payload('canonical-alias') })).toThrow('already exists')
    expect(() => commands.register({ name: 'new', payload: payload('reserved') })).toThrow('reserved')
    expect(() => commands.register({ name: 'new-alias', aliases: ['new'], payload: payload('reserved-alias') })).toThrow('reserved')
    expect(commands.resolve('other')).toBeUndefined()
    expect(commands.resolve('new')).toBeUndefined()
    expect(commands.list()).toHaveLength(1)
    expect(commands.list()[0]!.payload).toBe(original)
  })

  it('rejects a registration that repeats its own names after normalization', () => {
    const commands = catalog({ normalize: name => name.toLowerCase() })
    expect(() => commands.register({
      name: 'Echo',
      aliases: ['echo', 'other'],
      payload: payload('echo'),
    })).toThrow('repeats')
    expect(commands.list()).toEqual([])
    expect(commands.resolve('echo')).toBeUndefined()
  })

  it('runs all validation before changing the index', () => {
    const commands = catalog({
      validate: (name) => {
        if (name === 'bad')
          throw new Error('invalid name')
      },
    })
    commands.register({ name: 'good', payload: payload('good') })
    expect(() => commands.register({ name: 'fresh', aliases: ['bad'], payload: payload('bad') })).toThrow('invalid name')
    expect(commands.resolve('fresh')).toBeUndefined()
    expect(commands.list().map(entry => entry.name)).toEqual(['good'])
  })

  it('disposes idempotently and never removes a later registration with the same name', () => {
    const commands = catalog()
    const old = payload('old')
    const disposeOld = commands.register({ name: 'echo', aliases: ['repeat'], payload: old })

    disposeOld()
    disposeOld()
    expect(commands.resolve('echo')).toBeUndefined()
    expect(commands.resolve('repeat')).toBeUndefined()
    expect(commands.list()).toEqual([])

    const replacement = payload('new')
    const disposeReplacement = commands.register({ name: 'echo', aliases: ['repeat'], payload: replacement })
    disposeOld()
    expect(commands.resolve('echo')).toBe(replacement)
    expect(commands.resolve('repeat')).toBe(replacement)
    expect(commands.list()).toHaveLength(1)

    disposeReplacement()
    expect(commands.resolve('echo')).toBeUndefined()
  })

  it('supports re-registration after disposal and exposes live metadata snapshots', () => {
    const commands = catalog()
    const command = payload('echo')
    const dispose = commands.register({ name: 'echo', payload: command })
    dispose()

    command.description = 'new description'
    command.examples.push('echo hello')
    commands.register({ name: 'echo', payload: command })
    const first = commands.list()
    expect(first[0]!.metadata).toEqual({
      description: 'new description',
      examples: ['echo hello'],
      hidden: false,
    })

    ;(first[0]!.aliases as string[]).push('mutated')
    ;(first[0]!.metadata.examples as string[]).push('mutated')
    const second = commands.list()
    expect(second[0]!.aliases).toEqual([])
    expect(second[0]!.metadata.examples).toEqual(['echo hello'])
    expect(second[0]!.payload).toBe(command)
    expect(commands.resolve('mutated')).toBeUndefined()
  })

  it('checks names and reserved aliases through the public helpers', () => {
    const commands = catalog({ reserved: ['help'] })
    commands.register({ name: 'echo', aliases: ['repeat'], payload: payload('echo') })
    expect(commands.has('echo')).toBe(true)
    expect(commands.has('repeat')).toBe(true)
    expect(commands.has('missing')).toBe(false)
    expect(commands.isReserved('help')).toBe(true)
    expect(commands.isReserved('missing')).toBe(false)
  })

  it('keeps Map replacements isolated from old registration disposers', () => {
    const commands = catalog()
    const original = payload('same')
    const dispose = commands.register({ name: 'echo', payload: original })
    expect(commands.getDisposer('echo')).toBe(dispose)
    const view = commands.asMap()
    expect(commands.asMap()).toBe(view)
    view.set('echo', original)
    dispose()
    expect(commands.resolve('echo')).toBe(original)
    commands.getDisposer('echo')!()
    expect(view.size).toBe(0)
  })

  it('keeps the legacy Map view separate from alias registrations', () => {
    const commands = catalog()
    commands.asMap()
    expect(() => commands.register({ name: 'echo', aliases: ['repeat'], payload: payload('echo') })).toThrow('without aliases')
    expect(commands.list()).toEqual([])

    const aliased = catalog()
    aliased.register({ name: 'echo', aliases: ['repeat'], payload: payload('echo') })
    expect(() => aliased.asMap()).toThrow('without aliases')
    expect(aliased.resolve('repeat')).toBeDefined()
  })
})
