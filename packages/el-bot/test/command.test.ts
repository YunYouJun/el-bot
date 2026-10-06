import type { Receive, SendMessageSegment } from 'node-napcat-ts'
import type { Bot } from '../core/bot'
import type { CommandContext } from '../core/bot/command'
import type { LiteCycleHook, NapcatMessage } from '../core/composition-api/hooks'
import { createHooks } from 'hookable'
import { describe, expect, it, vi } from 'vitest'
import { Command } from '../core/bot/command'
import { dispatchNapcatMessage } from '../core/bot/message'

function createBot() {
  const reply = vi.fn().mockResolvedValue(undefined)
  const logger = { error: vi.fn() }
  const hooks = createHooks<LiteCycleHook>()
  const bot = { el: { bot: { name: '小云' } }, reply, logger, hooks } as unknown as Bot
  bot._command = new Command(bot)
  return { bot, commands: bot._command, reply, logger, hooks }
}

function message(text: string, group = false, segments?: Receive[keyof Receive][]): NapcatMessage {
  return {
    self_id: 100,
    sender: { user_id: 200 },
    message_type: group ? 'group' : 'private',
    sub_type: group ? 'normal' : 'friend',
    message_id: 1,
    raw_message: text,
    message: segments ?? [{ type: 'text', data: { text } }],
  } as NapcatMessage
}

function at(qq = '100'): Receive['at'] {
  return { type: 'at', data: { qq } }
}

function text(content: string): Receive['text'] {
  return { type: 'text', data: { text: content } }
}

describe('user command registration and execution', () => {
  it('keeps definitions, descriptions and callbacks independent', async () => {
    const { commands, reply } = createBot()
    const first = commands.command('早').description('早安').action(() => '早上好')
    const second = commands.command('晚').description('晚安').action(() => '晚安啦')
    expect(first).not.toBe(second)
    expect(first.name).toBe('早')
    expect(first.desc).toBe('早安')
    expect(second.desc).toBe('晚安')
    expect(await commands.execute('早')).toEqual({ matched: true, result: '早上好' })
    expect(await commands.execute('晚')).toEqual({ matched: true, result: '晚安啦' })
    expect(reply).not.toHaveBeenCalled()
  })

  it('splits all whitespace while preserving the first callback argument', async () => {
    const { bot, commands } = createBot()
    const callback = vi.fn().mockResolvedValue('结果')
    commands.command('搜索').action(callback)
    expect(await commands.parse(' \n搜索\t百度　云游君\n ')).toEqual({ matched: true, result: '结果' })
    expect(callback).toHaveBeenCalledWith(['百度', '云游君'], expect.objectContaining({ bot, source: 'programmatic', message: undefined }))
  })

  it('distinguishes unknown commands from a matched void action', async () => {
    const { commands } = createBot()
    commands.command('静默').action(() => {})
    expect(await commands.execute('静默')).toEqual({ matched: true, result: undefined })
    expect(await commands.execute('未知')).toEqual({ matched: false })
    expect(await commands.execute(' \n ')).toEqual({ matched: false })
  })

  it('rejects duplicates without replacing the original callback', async () => {
    const { commands } = createBot()
    const deferred = commands.command('测试')
    const first = commands.command('测试').action(() => '原始结果')
    expect(() => commands.command('测试')).toThrow('already exists')
    expect(() => deferred.action(() => '覆盖')).toThrow('already exists')
    expect(() => first.action(() => '覆盖')).toThrow('already exists')
    expect(await commands.execute('测试')).toEqual({ matched: true, result: '原始结果' })
  })

  it.each(['', ' ', '两个 命令', '两个\t命令', 'help', '帮助'])('rejects invalid or reserved name %j', (name) => {
    const { commands } = createBot()
    expect(() => commands.command(name)).toThrow()
  })

  it('only lists definitions with an action and never executes actions to get help', () => {
    const { commands } = createBot()
    const callback = vi.fn()
    commands.command('未完成').description('不应出现')
    commands.command('搜索').description('返回搜索链接').usage('搜索 <引擎> <关键词>').example('搜索 百度 云游君').example('搜索 必应 el-bot').action(callback)
    expect(commands.getHelp()).toContain('搜索：返回搜索链接')
    expect(commands.getHelp()).not.toContain('未完成')
    expect(commands.getHelp('搜索')).toBe('搜索：返回搜索链接\n用法：搜索 <引擎> <关键词>\n示例：\n  搜索 百度 云游君\n  搜索 必应 el-bot')
    expect(commands.getHelp('未知')).toContain('未找到命令「未知」')
    expect(callback).not.toHaveBeenCalled()
  })

  it('provides built-in help with aliases even when the registry is empty', async () => {
    const { commands } = createBot()
    expect(await commands.execute('help')).toEqual(await commands.execute('帮助'))
    expect(await commands.execute('帮助 help')).toEqual({ matched: true, result: commands.getHelp('help') })
    commands.command('无描述').action(() => {})
    expect(commands.getHelp('无描述')).toBe('无描述：没有说明\n用法：无描述')
  })

  it('propagates programmatic errors and prevents context.reply from sending', async () => {
    const { commands, reply } = createBot()
    const failure = new Error('callback failure')
    commands.command('失败').action(async () => {
      throw failure
    })
    commands.command('发送').action(async (_, context) => {
      await context.reply('不可发送')
    })
    await expect(commands.execute('失败')).rejects.toBe(failure)
    await expect(commands.execute('发送')).rejects.toThrow('Reply is unavailable')
    expect(reply).not.toHaveBeenCalled()
  })

  it('replaces plugin commands on reload while keeping manual commands', async () => {
    const { commands } = createBot()
    commands.command('手动').action(() => '保留')
    await commands.reloadPlugins(async () => {
      commands.command('answer').action(() => '旧配置')
      commands.command('旧插件').action(() => '旧结果')
    })
    await commands.reloadPlugins(async () => {
      commands.command('answer').action(() => '新配置')
    })
    expect(await commands.execute('手动')).toEqual({ matched: true, result: '保留' })
    expect(await commands.execute('answer')).toEqual({ matched: true, result: '新配置' })
    expect(await commands.execute('旧插件')).toEqual({ matched: false })
  })

  it('tracks partial plugin registrations when setup fails', async () => {
    const { commands } = createBot()
    await expect(commands.reloadPlugins(async () => {
      commands.command('部分').action(() => '旧结果')
      throw new Error('setup failed')
    })).rejects.toThrow('setup failed')
    await commands.reloadPlugins(async () => {
      commands.command('部分').action(() => '新结果')
    })
    expect(await commands.execute('部分')).toEqual({ matched: true, result: '新结果' })
  })
})

describe('napCat command messages', () => {
  it.each([
    ['私聊', message('回声 测试')],
    ['私聊昵称', message('小云 回声 测试')],
    ['群聊昵称', message('小云\t回声 测试', true)],
    ['群聊开头艾特', message('ignored raw text', true, [at(), text(' 回声 测试')])],
    ['开头空白与分开的文本段', message('', true, [text(' \n'), at(), text('回'), text('声 测试')])],
  ])('executes %s using structured text', async (_, incoming) => {
    const { commands, reply } = createBot()
    commands.command('回声').action(args => args.join(' '))
    expect(await commands.handleMessage(incoming)).toBe(true)
    expect(reply).toHaveBeenCalledExactlyOnceWith(incoming, '测试')
  })

  it.each([
    ['群聊无前缀', message('回声 测试', true)],
    ['昵称无边界', message('小云回声 测试', true)],
    ['昵称不是开头', message('请 小云 回声 测试', true)],
    ['艾特其他用户', message('', true, [at('999'), text('回声 测试')])],
    ['艾特所有人', message('', true, [at('all'), text('回声 测试')])],
    ['艾特不是开头', message('', true, [text('回声 '), at(), text('测试')])],
    ['伪造 CQ 文本', message('[CQ:at,qq=100] 回声 测试', true)],
    ['未知命令', message('小云 未知命令', true)],
  ])('leaves %s unconsumed', async (_, incoming) => {
    const { commands, reply } = createBot()
    const callback = vi.fn()
    commands.command('回声').action(callback)
    expect(await commands.handleMessage(incoming)).toBe(false)
    expect(callback).not.toHaveBeenCalled()
    expect(reply).not.toHaveBeenCalled()
  })

  it('leaves mixed media and self-sent messages to existing hooks', async () => {
    const { commands, reply } = createBot()
    const callback = vi.fn()
    commands.command('回声').action(callback)
    const incoming = message('回声', false, [text('回声'), { type: 'image', data: {} } as Receive['image']])
    expect(await commands.handleMessage(incoming)).toBe(false)
    const ownMessage = message('回声')
    ownMessage.sender.user_id = ownMessage.self_id
    expect(await commands.handleMessage(ownMessage)).toBe(false)
    expect(callback).not.toHaveBeenCalled()
    expect(reply).not.toHaveBeenCalled()
  })

  it('automatically replies with an async message chain', async () => {
    const { commands, reply } = createBot()
    const chain: SendMessageSegment[] = [text('消息链')]
    commands.command('链').action(async () => chain)
    const incoming = message('链')
    expect(await commands.handleMessage(incoming)).toBe(true)
    expect(reply).toHaveBeenCalledExactlyOnceWith(incoming, chain)
  })

  it('prefers a direct private command when it is also the bot nickname', async () => {
    const { bot, commands, reply } = createBot()
    bot.el.bot.name = 'help'
    const callback = vi.fn().mockReturnValue('应答结果')
    commands.command('answer').description('应答帮助').action(callback)
    await commands.handleMessage(message('help answer'))
    expect(callback).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith(expect.anything(), commands.getHelp('answer'))
    bot.el.bot.name = 'answer'
    await commands.handleMessage(message('answer 内容'))
    expect(callback).toHaveBeenCalledWith(['内容'], expect.anything())
  })

  it('allows multiple manual replies without an extra reply for void', async () => {
    const { commands, reply } = createBot()
    const incoming = message('多条')
    commands.command('多条').action(async (_, context) => {
      expect(context.source).toBe('message')
      expect(context.message).toBe(incoming)
      await context.reply('一')
      await context.reply('二', true)
    })
    await commands.handleMessage(incoming)
    expect(reply.mock.calls).toEqual([[incoming, '一', false], [incoming, '二', true]])
  })

  it('preserves a caller-owned chain when quoting a manual reply', async () => {
    const { commands, reply } = createBot()
    const chain: SendMessageSegment[] = [text('回复')]
    reply.mockImplementation(async (_, content: SendMessageSegment[]) => {
      content.unshift({ type: 'reply', data: { id: '1' } })
    })
    commands.command('引用').action(async (_, context) => {
      await context.reply(chain, true)
    })
    await commands.handleMessage(message('引用'))
    expect(chain).toEqual([text('回复')])
  })

  it('keeps automatic and manual replies bound to concurrent messages', async () => {
    const { commands, reply } = createBot()
    let release: () => void = () => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const contexts: CommandContext[] = []
    commands.command('任务').action(async (args, context) => {
      contexts.push(context)
      if (args[0] === '一')
        await blocked
      await context.reply(`进度${args[0]}`)
      return `结果${args[0]}`
    })
    const first = message('任务 一')
    const second = message('任务 二')
    second.message_id = 2
    second.sender.user_id = 300
    const pending = commands.handleMessage(first)
    await commands.handleMessage(second)
    release()
    await pending
    expect(contexts[0]).not.toBe(contexts[1])
    expect(reply.mock.calls).toEqual([
      [second, '进度二', false],
      [second, '结果二'],
      [first, '进度一', false],
      [first, '结果一'],
    ])
  })

  it('consumes failures, logs details and replies without exposing the exception', async () => {
    const { commands, logger, reply } = createBot()
    const failure = new Error('private details')
    commands.command('失败').action(async () => {
      throw failure
    })
    const incoming = message('失败')
    expect(await commands.handleMessage(incoming)).toBe(true)
    expect(logger.error).toHaveBeenCalledWith('[command] Execution failed', failure)
    expect(reply).toHaveBeenCalledExactlyOnceWith(incoming, '命令执行失败，请稍后重试。')
  })

  it('handles rejected QQ sends without an unhandled rejection', async () => {
    const { commands, logger, reply } = createBot()
    reply.mockRejectedValue(new Error('send failed'))
    commands.command('发送').action(() => '结果')
    expect(await commands.handleMessage(message('发送'))).toBe(true)
    expect(reply).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledTimes(2)
  })
})

describe('napCat command and hook dispatch', () => {
  it('consumes commands and help before ordinary plugin hooks', async () => {
    const { bot, commands, hooks, reply } = createBot()
    const hook = vi.fn()
    hooks.hook('onMessage', hook)
    commands.command('静默').action(() => {})
    await dispatchNapcatMessage(bot, message('静默'))
    await dispatchNapcatMessage(bot, message('帮助 静默'))
    expect(hook).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['friend', message('小云 不存在'), ['onMessage', 'onNapcatMessage', 'onPrivateFriendMessage', 'onPrivateMessage']],
    ['temporary group', { ...message('小云 不存在'), sub_type: 'group' } as NapcatMessage, ['onMessage', 'onNapcatMessage', 'onPrivateGroupMessage', 'onPrivateMessage']],
    ['group', message('小云 不存在', true), ['onMessage', 'onNapcatMessage', 'onGroupMessage']],
  ])('dispatches unmatched %s messages to the correct hooks in order', async (_, incoming, expected) => {
    const { bot, hooks, reply } = createBot()
    const calls: string[] = []
    const names: (keyof LiteCycleHook)[] = ['onMessage', 'onNapcatMessage', 'onPrivateFriendMessage', 'onPrivateGroupMessage', 'onPrivateMessage', 'onGroupMessage']
    for (const name of names)
      hooks.hook(name, () => { calls.push(name) })
    await dispatchNapcatMessage(bot, incoming as NapcatMessage)
    expect(calls).toEqual(expected)
    expect(reply).not.toHaveBeenCalled()
  })
})
