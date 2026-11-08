import type { InboundContext } from '../packages/dsh/src/qq/contracts'
import type { Bot } from '../packages/el-bot/core/bot'
import { describe, expect, it, vi } from 'vitest'
import { QQCommandRegistry } from '../packages/dsh/src/qq-commands/registry'
import { QQCommandRouter } from '../packages/dsh/src/qq-commands/router'
import { Command } from '../packages/el-bot/core/bot/command'

/** Shared business function; both adapters keep their own names and parser. */
function echo(args: readonly string[]) {
  return args.join(' ')
}

function createBot() {
  const bot = {
    el: { bot: { name: '小云' } },
    reply: vi.fn().mockResolvedValue(undefined),
    logger: { error: vi.fn() },
  } as unknown as Bot
  bot._command = new Command(bot)
  return bot
}

function inbound(content: string): InboundContext {
  return {
    bot: {
      appId: '123',
      sendText: vi.fn(async () => ({})),
      sendMarkdown: vi.fn(async () => ({})),
    } as unknown as InboundContext['bot'],
    message: { kind: 'c2c', senderId: 'owner', messageId: 'message-1', content },
    replyTarget: { scope: 'c2c', targetId: 'owner', msgId: 'message-1' },
    state: {},
    stop: vi.fn(),
  }
}

describe('shared command business function', () => {
  it('is callable from both adapters without sharing names or execution state', async () => {
    const bot = createBot()
    bot._command.command('回声').action(args => echo(args))
    expect(await bot._command.execute('回声 hello world')).toEqual({
      matched: true,
      result: 'hello world',
    })

    const commands = new QQCommandRegistry()
    commands.command('echo').alias('repeat').action(args => echo(args))
    const router = new QQCommandRouter(commands, { owner: 'owner' })
    const qq = inbound('/repeat hello world')
    expect(await router.handle(qq)).toBe(true)
    expect(qq.bot.sendText).toHaveBeenCalledWith(qq.replyTarget, 'hello world')

    expect(bot._command.getHelp('回声')).toContain('回声')
    expect(commands.help('repeat')).toContain('/echo')
  })
})
