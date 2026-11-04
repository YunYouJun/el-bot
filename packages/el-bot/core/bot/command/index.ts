import type { Bot } from '..'
import type { MessageContext } from '../../adapter'
import type { NapcatMessage } from '../../composition-api'
import type { CommandAction, CommandContext, CommandExecution, CommandReply } from './types'
import { getCommandText, getHelpContent, helpNames } from './utils'

export * from './types'

/** A user command definition, backed by the bot's shared registry. */
export class Command {
  desc = ''
  usageText = ''
  examples: string[] = []
  callback?: CommandAction
  readonly children: Map<string, Command>
  private pluginCommands = new Set<Command>()

  constructor(public ctx: Bot, public readonly name = '', registry?: Command) {
    this.children = registry?.children ?? new Map()
  }

  command(name: string) {
    name = name.trim()
    if (!name || /\s/u.test(name))
      throw new Error('A command name must be a single non-empty word')
    if (helpNames.has(name) || this.children.has(name))
      throw new Error(`Command "${name}" already exists`)
    return new Command(this.ctx, name, this)
  }

  description(desc: string) {
    this.desc = desc
    return this
  }

  usage(text: string) {
    this.usageText = text
    return this
  }

  example(text: string) {
    this.examples.push(text)
    return this
  }

  /** Only definitions with an action become available to users. */
  action(callback: CommandAction) {
    if (!this.name)
      throw new Error('Register a command before setting its action')
    if (helpNames.has(this.name) || this.children.has(this.name))
      throw new Error(`Command "${this.name}" already exists`)
    this.callback = callback
    this.children.set(this.name, this)
    return this
  }

  getHelp(name?: string) {
    return getHelpContent(this.children, name)
  }

  /** Replace plugin registrations on restart while preserving manual commands. */
  async reloadPlugins(setup: () => Promise<void>) {
    for (const [name, command] of this.children) {
      if (this.pluginCommands.has(command))
        this.children.delete(name)
    }
    const existing = new Set(this.children.values())
    try {
      await setup()
    }
    finally {
      this.pluginCommands = new Set([...this.children.values()].filter(command => !existing.has(command)))
    }
  }

  /** Execute without a message to return a result without sending to QQ. */
  async execute(text: string, message?: NapcatMessage, session?: MessageContext): Promise<CommandExecution> {
    const [name, ...args] = text.trim().split(/\s+/u)
    if (helpNames.has(name))
      return { matched: true, result: this.getHelp(args[0]) }
    const command = this.children.get(name)
    if (!command?.callback)
      return { matched: false }

    const context: CommandContext = {
      bot: this.ctx,
      source: message || session ? 'message' : 'programmatic',
      message,
      session,
      reply: async (content: CommandReply, quote = false) => {
        if (session && !message) {
          if (typeof content !== 'string')
            throw new Error('Platform commands currently support text replies only')
          return session.reply(content)
        }
        if (!message)
          throw new Error('Reply is unavailable during programmatic command execution')
        // Bot.reply can prepend a quote; keep the caller's message chain intact.
        return this.ctx.reply(message, typeof content === 'string' ? content : [...content], quote)
      },
    }
    return { matched: true, result: await command.callback(args, context) }
  }

  /** Preserve the original programmatic parser entry point. */
  parse(text: string) {
    return this.execute(text)
  }

  /** Return true only when a command has consumed the incoming message. */
  async handleMessage(message: NapcatMessage, session?: MessageContext) {
    const text = getCommandText(message, this.ctx.el.bot.name, this.children)
    if (text === undefined)
      return false
    try {
      const execution = await this.execute(text, message, session)
      if (!execution.matched)
        return false
      if (execution.result !== undefined)
        await this.ctx.reply(message, execution.result)
    }
    catch (error) {
      this.ctx.logger.error('[command] Execution failed', error)
      try {
        await this.ctx.reply(message, '命令执行失败，请稍后重试。')
      }
      catch (replyError) {
        this.ctx.logger.error('[command] Failure reply failed', replyError)
      }
    }
    return true
  }

  async handleSession(session: MessageContext) {
    if (session.sender.id === session.accountId)
      return false
    let text = session.text.trim()
    const prefix = this.ctx.el.bot.name.trim()
    const named = prefix && text.startsWith(prefix) && /\s/u.test(text.charAt(prefix.length))
    if (session.chat.type === 'group' && !session.addressed && !named)
      return false
    if (named)
      text = text.slice(prefix.length).trim()
    try {
      const execution = await this.execute(text, undefined, session)
      if (!execution.matched)
        return false
      if (execution.result !== undefined) {
        if (typeof execution.result !== 'string')
          throw new Error('Platform commands currently support text replies only')
        await session.reply(execution.result)
      }
    }
    catch (error) {
      this.ctx.logger.error('[command] Execution failed', error)
      await session.reply('命令执行失败，请稍后重试。').catch(error => this.ctx.logger.error('[command] Failure reply failed', error))
    }
    return true
  }
}
