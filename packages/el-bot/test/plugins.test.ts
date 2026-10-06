import type { Bot } from '../core/bot'
import type { BotPlugin } from '../core/bot/plugins'
import type { LiteCycleHook, NapcatMessage } from '../core/composition-api'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import consola from 'consola'
import { createHooks } from 'hookable'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import pingPlugin from '../../../examples/simple/bot/plugins/ping'
import testPlugin from '../../create-app/template-ts/plugins/test'
import { Bot as BotClass } from '../core/bot'
import { Command } from '../core/bot/command'
import { pluginLogger } from '../core/bot/logger'
import { dispatchNapcatMessage } from '../core/bot/message'
import { defineBotPlugin, getAllPluginsFromDir, parsePluginEntry, Plugins, resolvePluginFromName } from '../core/bot/plugins'
import loginPlugin from '../templates/plugin-example'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'el-bot-plugins-'))
  vi.spyOn(consola, 'error').mockImplementation(() => {})
  vi.spyOn(consola, 'warn').mockImplementation(() => {})
  vi.spyOn(consola, 'start').mockImplementation(() => {})
  vi.spyOn(consola, 'log').mockImplementation(() => {})
  vi.spyOn(pluginLogger, 'error').mockReturnValue(pluginLogger)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

function createBot(plugins: BotPlugin[] = []) {
  const bot = Object.create(BotClass.prototype) as Bot
  bot.el = { bot: { name: '小云', plugins } } as Bot['el']
  bot.hooks = createHooks<LiteCycleHook>()
  bot.reply = vi.fn().mockResolvedValue(undefined)
  bot.napcat = { get_login_info: vi.fn().mockResolvedValue({ nickname: '小云', user_id: 100 }) } as unknown as Bot['napcat']
  bot._command = new Command(bot)
  bot.plugins = new Plugins(bot)
  return bot
}

describe('custom plugin discovery', () => {
  it('skips missing and non-directory paths with a diagnostic', async () => {
    const missing = path.join(directory, 'missing')
    const file = path.join(directory, 'file')
    await writeFile(file, 'not a directory')
    expect(await getAllPluginsFromDir(missing)).toEqual([])
    expect(await getAllPluginsFromDir(file)).toEqual([])
    expect(consola.warn).toHaveBeenCalledWith(expect.stringContaining(missing), expect.anything())
    expect(consola.warn).toHaveBeenCalledWith(expect.stringContaining(file), expect.anything())
  })

  it('loads ESM files and supplies their filename as metadata', async () => {
    // Encoded paths are covered by the native Node package smoke test.
    await writeFile(path.join(directory, 'standalone.mjs'), 'export default { setup() {} }')
    const plugins = await getAllPluginsFromDir(directory)
    expect(consola.error).not.toHaveBeenCalled()
    expect(plugins).toHaveLength(1)
    expect(plugins[0].pkg?.name).toBe('standalone')
    expect(typeof plugins[0].setup).toBe('function')
  })

  it('reads directory metadata as JSON and preserves explicit plugin metadata', async () => {
    for (const name of ['with-package', 'explicit', 'directory.with.dots']) {
      await mkdir(path.join(directory, name))
      await writeFile(path.join(directory, name, 'index.mjs'), name === 'explicit'
        ? 'export default { pkg: { name: "explicit-name", version: "2" }, setup() {} }'
        : 'export default { setup() {} }')
      if (name !== 'directory.with.dots')
        await writeFile(path.join(directory, name, 'package.json'), JSON.stringify({ name: 'package-name', version: '1', description: 'package description' }))
    }
    const resolve = (name: string) => resolvePluginFromName({ rootDir: directory, name })
    expect((await resolve('with-package'))?.pkg).toEqual({ name: 'package-name', version: '1', description: 'package description' })
    expect((await resolve('explicit'))?.pkg).toEqual({ name: 'explicit-name', version: '2' })
    expect((await resolve('directory.with.dots'))?.pkg?.name).toBe('directory.with.dots')
  })

  it('isolates import, factory and export failures while ignoring documentation and declarations', async () => {
    const fixtures = {
      '01-import.mjs': 'import "./missing.mjs"; export default { setup() {} }',
      '02-factory.mjs': 'export default () => { throw new Error("factory failed") }',
      '03-invalid.mjs': 'export default { install() {} }',
      '04-valid.mjs': 'export default options => ({ pkg: { name: "valid" }, setup() {}, options })',
      'README.md': 'not JavaScript',
      'types.d.ts': 'not JavaScript',
      '.ignored.mjs': 'throw new Error("must not import")',
    }
    for (const [name, source] of Object.entries(fixtures))
      await writeFile(path.join(directory, name), source)
    const plugins = await getAllPluginsFromDir(directory)
    expect(plugins.map(plugin => plugin.pkg?.name)).toEqual(['valid'])
    expect(consola.error).toHaveBeenCalledTimes(3)
    await expect(parsePluginEntry(path.join(directory, '03-invalid.mjs'))).rejects.toThrow('setup(bot)')
  })
})

describe('plugin setup isolation', () => {
  it('awaits configured plugins in order and continues after sync, async and invalid setup failures', async () => {
    const calls: string[] = []
    const bot = createBot([
      {
        setup: () => {
          calls.push('sync')
          throw new Error('sync failure')
        },
      },
      {
        setup: async () => {
          await Promise.resolve()
          calls.push('async')
          throw new Error('async failure')
        },
      },
      null as unknown as BotPlugin,
      {
        setup: async (ctx) => {
          calls.push('valid')
          ctx.command('valid').action(() => 'loaded')
        },
      },
    ])
    await bot.plugins.loadConfig()
    expect(calls).toEqual(['sync', 'async', 'valid'])
    expect(await bot.executeCommand('valid')).toEqual({ matched: true, result: 'loaded' })
    expect(pluginLogger.error).toHaveBeenCalledTimes(3)
  })

  it('keeps later custom plugins usable and reloads partial registrations after setup failure', async () => {
    const fixtures = {
      '01-partial.mjs': 'export default { setup(bot) { bot.command("partial").action(() => "partial"); throw new Error("setup failed") } }',
      '02-async.mjs': 'export default { async setup() { await Promise.resolve(); throw new Error("async setup failed") } }',
      '03-valid.mjs': 'export default { async setup(bot) { await Promise.resolve(); bot.command("valid").action(() => "loaded") } }',
    }
    for (const [name, source] of Object.entries(fixtures))
      await writeFile(path.join(directory, name), source)
    const bot = createBot()
    bot.command('manual').action(() => 'kept')
    await bot._command.reloadPlugins(() => bot.plugins.loadCustom(directory))
    expect(await bot.executeCommand('valid')).toEqual({ matched: true, result: 'loaded' })
    expect(pluginLogger.error).toHaveBeenCalledTimes(2)
    await bot._command.reloadPlugins(() => bot.plugins.loadCustom(directory))
    expect(await bot.executeCommand('valid')).toEqual({ matched: true, result: 'loaded' })
    expect(await bot.executeCommand('manual')).toEqual({ matched: true, result: 'kept' })
    expect(pluginLogger.error).toHaveBeenCalledTimes(4)
  })
})

describe('command plugin templates', () => {
  it('preserves object and factory types and their runtime shapes', () => {
    const plugin = defineBotPlugin({ setup() {} })
    const factory = defineBotPlugin<{ name: string }>(options => ({ pkg: { name: options.name }, setup() {} }))
    expectTypeOf(plugin).toEqualTypeOf<BotPlugin>()
    expectTypeOf(factory).toEqualTypeOf<(options: { name: string }) => BotPlugin>()
    expect(typeof plugin.setup).toBe('function')
    expect(factory({ name: 'configured' }).pkg?.name).toBe('configured')
  })

  it.each([
    ['test', testPlugin, 'Link Start!'],
    ['ping', pingPlugin, 'pong'],
    ['login', loginPlugin, '当前登录账号：小云(100)'],
  ])('registers %s with help, automatic replies and message consumption', async (name, plugin, expected) => {
    const bot = createBot([plugin])
    const hook = vi.fn()
    bot.hooks.hook('onNapcatMessage', hook)
    await bot.plugins.loadConfig()
    const incoming = {
      message_type: 'private',
      sub_type: 'friend',
      self_id: 100,
      sender: { user_id: 200 },
      message_id: 1,
      raw_message: name,
      message: [{ type: 'text', data: { text: name } }],
    } as NapcatMessage
    expect(bot.getCommandHelp(name)).toContain(`用法：${name}`)
    await dispatchNapcatMessage(bot, incoming)
    expect(bot.reply).toHaveBeenCalledExactlyOnceWith(incoming, expected)
    expect(hook).not.toHaveBeenCalled()
  })
})
