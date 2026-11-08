import type { InboundContext } from '../qq/contracts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QQPolicy } from '../qq/policy'
import { QQStateStore } from '../qq/store'
import { DOWNSTREAM_COMMANDS, registerBuiltinQQCommands } from './builtins'
import { QQCommandRegistry } from './registry'
import { parseQQCommand, QQCommandRouter } from './router'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function registry(options: Parameters<typeof registerBuiltinQQCommands>[1] = {}) {
  const commands = new QQCommandRegistry({ catalog: DOWNSTREAM_COMMANDS })
  registerBuiltinQQCommands(commands, options)
  return commands
}

function inbound(content: string, options: { senderId?: string, messageId?: string } = {}): InboundContext {
  const senderId = options.senderId ?? 'owner'
  const messageId = options.messageId ?? 'message-1'
  return {
    bot: {
      appId: '123',
      sendText: vi.fn(async () => ({})),
      sendMarkdown: vi.fn(async () => ({})),
    } as unknown as InboundContext['bot'],
    message: { kind: 'c2c', senderId, messageId, content },
    replyTarget: { scope: 'c2c', targetId: 'owner', msgId: messageId },
    state: {},
    stop: vi.fn(),
  }
}

async function privatePolicy() {
  const directory = await mkdtemp(join(tmpdir(), 'qq-commands-'))
  directories.push(directory)
  const policy = new QQPolicy({ appId: '123', ownerOpenId: 'owner' }, new QQStateStore(join(directory, 'state.json')), '/groups')
  return { policy, directory }
}

describe('qQ command registry', () => {
  it('supports el-bot style chaining and publishes dynamic help', async () => {
    const commands = registry()
    const action = vi.fn((args: string[]) => `echo:${args.join(' ')}`)
    commands.command('echo')
      .description('原样返回参数')
      .usage('echo <文本>')
      .example('echo hello')
      .alias('repeat')
      .action(action)

    const help = commands.help()
    expect(help).toContain('/help')
    expect(help).toContain('/ping')
    expect(help).toContain('/echo')
    expect(help).toContain('/new')
    expect(help).toContain('/bot-status')
    expect(help).toContain('DSH / QQ 内置指令')

    const detail = commands.help('repeat')
    expect(detail).toContain('说明：原样返回参数')
    expect(detail).toContain('用法：/echo <文本>')
    expect(detail).toContain('示例：echo hello')

    const ctx = inbound('/repeat hello world')
    expect(await new QQCommandRouter(commands, { owner: 'owner' }).handle(ctx)).toBe(true)
    expect(action).toHaveBeenCalledWith(['hello', 'world'], expect.objectContaining({ name: 'echo' }))
    expect(ctx.bot.sendText).toHaveBeenCalledWith(ctx.replyTarget, 'echo:hello world')
  })

  it('rejects invalid, duplicate and dsh-qqbot reserved names', () => {
    const commands = registry()
    expect(() => commands.command('new')).toThrow('reserved')
    expect(() => commands.command('bad name')).toThrow('1-32')
    expect(() => commands.command('help')).toThrow('already exists')
    commands.command('one').alias('two').action(() => 'ok')
    expect(() => commands.command('three').alias('two').action(() => 'no')).toThrow('already exists')
    expect(commands.resolve('three')).toBeUndefined()
  })

  it('keeps delegated names reserved even when extra reserved names are supplied', () => {
    const commands = new QQCommandRegistry({
      catalog: DOWNSTREAM_COMMANDS,
      reserved: ['custom-reserved'],
    })
    expect(() => commands.command('new')).toThrow('reserved')
    expect(() => commands.command('reset')).toThrow('reserved')
    expect(() => commands.command('custom-reserved')).toThrow('reserved')
  })

  it('returns one structured directory entry per registration with its source', async () => {
    const commands = registry()
    const action = vi.fn(() => 'directory')
    commands.command('echo')
      .description('原样返回参数')
      .usage('echo <文本>')
      .example('echo hello')
      .alias('repeat')
      .action(action)
    commands.command('secret').hidden().action(() => 'hidden')

    const directory = commands.directory()
    expect(directory.filter(command => command.name === 'echo')).toHaveLength(1)
    expect(directory.find(command => command.name === 'repeat')).toBeUndefined()
    expect(directory.find(command => command.name === 'echo')).toMatchObject({
      name: 'echo',
      aliases: ['repeat'],
      description: '原样返回参数',
      usage: 'echo <文本>',
      examples: ['echo hello'],
      scope: 'c2c',
      permission: 'owner',
      hidden: false,
      source: 'local',
    })
    expect(directory.find(command => command.name === 'new')).toMatchObject({
      source: 'delegated',
      aliases: ['reset', 'clear'],
    })
    expect(directory.find(command => command.name === 'secret')?.hidden).toBe(true)
    expect(commands.help()).not.toContain('/secret')
    expect(action).not.toHaveBeenCalled()

    ;(directory.find(command => command.name === 'echo')!.aliases as string[]).push('mutated')
    expect(commands.directory().find(command => command.name === 'echo')!.aliases).toEqual(['repeat'])
    expect(commands.resolve('mutated')).toBeUndefined()
  })

  it('removes commands and aliases on dispose and restores them on remount', async () => {
    const commands = registry()
    const effects: (() => void)[] = []
    const mount = () => {
      effects.push((() => {
        const command = commands.command('temporary')
          .description('临时命令')
          .alias('temp')
          .action(() => 'temporary')
        return () => command.dispose()
      })())
    }
    const unmount = () => {
      while (effects.length)
        effects.pop()!()
    }

    mount()
    expect(commands.resolve('temporary')).toBeDefined()
    expect(commands.resolve('temp')).toBeDefined()
    expect(commands.help()).toContain('/temporary')
    expect(await new QQCommandRouter(commands, { owner: 'owner' }).handle(inbound('/temp'))).toBe(true)
    unmount()
    expect(commands.resolve('temporary')).toBeUndefined()
    expect(commands.resolve('temp')).toBeUndefined()
    expect(commands.help()).not.toContain('/temporary')

    mount()
    expect(commands.resolve('temp')).toBeDefined()
    unmount()
    expect(commands.resolve('temp')).toBeUndefined()
  })

  it('parses mentions and delegates known dsh-qqbot commands without consuming them', async () => {
    expect(parseQQCommand('<@!123> /help ping')).toEqual({ name: 'help', args: ['ping'], raw: 'ping' })
    expect(parseQQCommand('hello')).toBeUndefined()
    const commands = registry()
    const ctx = inbound('<@123> /new')
    expect(await new QQCommandRouter(commands, { owner: 'owner' }).handle(ctx)).toBe(false)
    expect(ctx.bot.sendText).not.toHaveBeenCalled()
    expect(ctx.stop).not.toHaveBeenCalled()
  })

  it('answers /help and /ping without invoking the model', async () => {
    const commands = registry()
    const router = new QQCommandRouter(commands, { owner: 'owner' })
    const help = inbound('/help')
    expect(await router.handle(help)).toBe(true)
    expect(help.bot.sendMarkdown).toHaveBeenCalledWith(help.replyTarget, expect.stringContaining('### 小云可用指令'))
    expect(help.bot.sendMarkdown).toHaveBeenCalledWith(help.replyTarget, expect.stringContaining('**/help**'))
    expect(help.bot.sendText).not.toHaveBeenCalled()
    expect(help.stop).toHaveBeenCalledWith('qq:command:matched')

    const ping = inbound('/ping')
    expect(await router.handle(ping)).toBe(true)
    expect(ping.bot.sendText).toHaveBeenCalledWith(ping.replyTarget, 'pong')
  })

  it('falls back to plain help when QQ rejects Markdown and remembers the limitation', async () => {
    const commands = registry()
    const router = new QQCommandRouter(commands, { owner: 'owner' })
    const first = inbound('/help')
    const firstSendMarkdown = first.bot.sendMarkdown as ReturnType<typeof vi.fn>
    firstSendMarkdown.mockRejectedValue(Object.assign(new Error('不允许发送原生 markdown'), { bizCode: 40034012 }))

    expect(await router.handle(first)).toBe(true)
    expect(firstSendMarkdown).toHaveBeenCalledOnce()
    expect(first.bot.sendText).toHaveBeenCalledWith(first.replyTarget, expect.stringContaining('小云可用指令'))
    expect(first.bot.sendText).not.toHaveBeenCalledWith(first.replyTarget, expect.stringContaining('###'))

    const second = inbound('/help', { messageId: 'message-2' })
    expect(await router.handle(second)).toBe(true)
    expect(second.bot.sendMarkdown).not.toHaveBeenCalled()
    expect(second.bot.sendText).toHaveBeenCalledWith(second.replyTarget, expect.stringContaining('小云可用指令'))
  })

  it('supports explicit Markdown replies, a text fallback, and an opt-out', async () => {
    const commands = registry()
    commands.command('styled').action(() => ({
      markdown: '### 标题\n\n- **项目**',
      text: '标题\n\n- 项目',
    }))
    const styled = inbound('/styled')
    expect(await new QQCommandRouter(commands, { owner: 'owner' }).handle(styled)).toBe(true)
    expect(styled.bot.sendMarkdown).toHaveBeenCalledWith(styled.replyTarget, '### 标题\n\n- **项目**')

    commands.command('helper').action((_args, command) => command.replyMarkdown('### 帮助', '帮助'))
    const helper = inbound('/helper')
    expect(await new QQCommandRouter(commands, { owner: 'owner' }).handle(helper)).toBe(true)
    expect(helper.bot.sendMarkdown).toHaveBeenCalledWith(helper.replyTarget, '### 帮助')

    const plainCommands = registry()
    const plain = inbound('/help')
    expect(await new QQCommandRouter(plainCommands, { owner: 'owner', markdown: false }).handle(plain)).toBe(true)
    expect(plain.bot.sendMarkdown).not.toHaveBeenCalled()
    expect(plain.bot.sendText).toHaveBeenCalledWith(plain.replyTarget, expect.stringContaining('小云可用指令'))
  })

  it('runs owner-only restart commands and requires force for an explicit interruption', async () => {
    const restart = vi.fn(async (_force: boolean, reply: (text: string) => Promise<void>) => reply('restarting'))
    const commands = registry({ restart })
    const router = new QQCommandRouter(commands, { owner: 'owner' })

    const normal = inbound('/restart')
    expect(await router.handle(normal)).toBe(true)
    expect(restart).toHaveBeenCalledWith(false, expect.any(Function))
    expect(normal.bot.sendText).toHaveBeenCalledWith(normal.replyTarget, 'restarting')

    const forced = inbound('/restart force')
    expect(await router.handle(forced)).toBe(true)
    expect(restart).toHaveBeenLastCalledWith(true, expect.any(Function))

    restart.mockClear()
    const invalid = inbound('/restart now')
    expect(await router.handle(invalid)).toBe(true)
    expect(restart).not.toHaveBeenCalled()
    expect(invalid.bot.sendText).toHaveBeenCalledWith(invalid.replyTarget, '用法：/restart [force]')

    const stranger = inbound('/restart', { senderId: 'stranger' })
    expect(await router.handle(stranger)).toBe(true)
    expect(stranger.bot.sendText).toHaveBeenCalledWith(stranger.replyTarget, '该指令仅限主人私聊使用。')
  })

  it('blocks unknown commands, enforces owner/scope/permission, and redacts action errors', async () => {
    const commands = registry()
    commands.command('group-only').scope('group').action(() => 'wrong scope')
    commands.command('admin-only').permission('group-admin').action(() => 'wrong permission')
    commands.command('explode').action(() => {
      throw new Error('token=private-secret')
    })
    const errors = vi.fn()
    const router = new QQCommandRouter(commands, { owner: 'owner', onError: errors })

    const unknown = inbound('/run build')
    expect(await router.handle(unknown)).toBe(true)
    expect(unknown.bot.sendText).toHaveBeenCalledWith(unknown.replyTarget, expect.stringContaining('未找到指令 /run'))
    expect(unknown.stop).toHaveBeenCalledWith('qq:command:unknown')

    const stranger = inbound('/ping', { senderId: 'stranger' })
    expect(await router.handle(stranger)).toBe(true)
    expect(stranger.bot.sendText).toHaveBeenCalledWith(stranger.replyTarget, '该指令仅限主人私聊使用。')

    const groupOnly = inbound('/group-only')
    expect(await router.handle(groupOnly)).toBe(true)
    expect(groupOnly.bot.sendText).toHaveBeenCalledWith(groupOnly.replyTarget, '该指令仅限群聊使用。')

    const adminOnly = inbound('/admin-only')
    expect(await router.handle(adminOnly)).toBe(true)
    expect(adminOnly.bot.sendText).toHaveBeenCalledWith(adminOnly.replyTarget, '该指令仅限群管理员使用。')

    const exploding = inbound('/explode')
    expect(await router.handle(exploding)).toBe(true)
    expect(errors).toHaveBeenCalledWith('explode', expect.any(Error))
    expect(exploding.bot.sendText).toHaveBeenCalledWith(exploding.replyTarget, '指令执行失败，请稍后重试。')
    expect(JSON.stringify(vi.mocked(exploding.bot.sendText).mock.calls)).not.toContain('private-secret')
  })

  it('honours manual takeover and strips control markup from replies', async () => {
    const commands = registry()
    commands.command('markup').action(() => '<qqbot-cmd-input text="/help"/>ok <@all>')
    const paused = inbound('/help')
    const router = new QQCommandRouter(commands, { owner: 'owner', isPaused: () => true })
    expect(await router.handle(paused)).toBe(true)
    expect(paused.bot.sendText).not.toHaveBeenCalled()
    expect(paused.stop).toHaveBeenCalledWith('qq:command:paused')

    const active = inbound('/markup')
    await new QQCommandRouter(commands, { owner: 'owner' }).handle(active)
    expect(active.bot.sendText).toHaveBeenCalledWith(active.replyTarget, 'ok')
  })
})

describe('qQ command policy boundary', () => {
  it('executes commands before the model, delegates built-ins, and deduplicates retries', async () => {
    const { policy } = await privatePolicy()
    const commands = registry()
    let executions = 0
    commands.command('custom').action(() => {
      executions++
      return 'custom-pong'
    })
    policy.command = ctx => new QQCommandRouter(commands, { owner: 'owner' }).handle(ctx)

    const ctx = inbound('/custom', { messageId: 'custom-1' })
    const next = vi.fn()
    await policy.middleware(ctx, next)
    expect(executions).toBe(1)
    expect(next).not.toHaveBeenCalled()
    expect(ctx.stop).toHaveBeenCalledWith('qq:command')
    expect(ctx.bot.sendText).toHaveBeenCalledWith(ctx.replyTarget, 'custom-pong')

    const duplicate = inbound('/custom', { messageId: 'custom-1' })
    await policy.middleware(duplicate, next)
    expect(executions).toBe(1)
    expect(duplicate.stop).toHaveBeenCalledWith('qq:duplicate-command')

    const builtin = inbound('/new', { messageId: 'new-1' })
    await policy.middleware(builtin, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('lets manual takeover win and never invokes commands in groups', async () => {
    const { policy } = await privatePolicy()
    const command = vi.fn(async () => true)
    policy.command = command
    policy.manual = {
      paused: () => true,
      automaticAllowed: () => true,
      observe: () => true,
      pausedSession: () => false,
    }
    const paused = inbound('/help')
    const next = vi.fn()
    await policy.middleware(paused, next)
    expect(command).not.toHaveBeenCalled()
    expect(paused.stop).toHaveBeenCalledWith('qq:manual')

    policy.manual = undefined
    const group = inbound('<@123> /help')
    group.message = { ...group.message, kind: 'group', groupOpenid: 'group-a', rawEventType: 'GROUP_AT_MESSAGE_CREATE' }
    group.replyTarget = { scope: 'group', targetId: 'group-a', msgId: 'message-1' }
    await policy.middleware(group, next)
    expect(command).not.toHaveBeenCalled()
    expect(group.stop).toHaveBeenCalledWith('qq:command')
  })
})
