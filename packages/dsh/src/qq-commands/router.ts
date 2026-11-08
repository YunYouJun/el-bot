import type { InboundContext } from '../qq/contracts'
import type { QQCommandContext, QQCommandRegistry, QQCommandReply, RegisteredQQCommand } from './registry'

export interface ParsedQQCommand {
  readonly name: string
  readonly args: string[]
  readonly raw: string
}

export interface QQCommandRouterOptions {
  /** Authenticated C2C owner. Commands never trust display names or message claims. */
  readonly owner: string
  /** Checked before execution and again before every reply so manual takeover always wins. */
  readonly isPaused?: () => boolean
  readonly onError?: (command: string, error: unknown) => void
  readonly maxReplyLength?: number
  readonly markdown?: boolean
}

const MAX_REPLY = 1600
const MARKDOWN_UNSUPPORTED = new Set([40034012, 40034090, 50056])

function markdownUnsupported(error: unknown) {
  if (!error || typeof error !== 'object')
    return false
  const code = Number((error as { bizCode?: unknown }).bizCode)
  if (MARKDOWN_UNSUPPORTED.has(code))
    return true
  const message = error instanceof Error ? error.message : ''
  return /不允许发送原生\s*markdown/iu.test(message)
}

export function parseQQCommand(content?: string): ParsedQQCommand | undefined {
  if (!content)
    return
  const cleaned = content.replace(/<@[^>]+>\s*/gu, '').trim()
  if (!cleaned.startsWith('/'))
    return
  const body = cleaned.slice(1).trim()
  if (!body)
    return { name: '', args: [], raw: '' }
  const [name, ...args] = body.split(/\s+/u)
  return { name: name.toLowerCase(), args, raw: args.join(' ') }
}

function replyText(value: string, limit: number) {
  const text = value
    .replace(/<qqbot-[^>]*>/giu, '')
    .replace(/<@[^>]*>/gu, '')
    .replace(/[^\P{Cc}\t\n\r]/gu, '')
    .trim()
  return text.slice(0, limit)
}

/** Deterministic command boundary in front of the model and dsh-qqbot's slash registry. */
export class QQCommandRouter {
  private markdownAvailable = true

  constructor(private readonly registry: QQCommandRegistry, private readonly options: QQCommandRouterOptions) {}

  async handle(ctx: InboundContext): Promise<boolean> {
    const parsed = parseQQCommand(ctx.message.content)
    if (!parsed)
      return false
    if (ctx.message.kind !== 'c2c')
      return false

    const stop = (reason: string) => ctx.stop(`qq:command:${reason}`)
    if (this.options.isPaused?.()) {
      stop('paused')
      return true
    }

    const name = parsed.name.replace(/[^\w:-]/giu, '').slice(0, 32)
    if (!name) {
      await this.send(ctx, '发送 /help 查看可用指令。')
      stop('empty')
      return true
    }

    const command = this.registry.resolve(name)
    if (!command) {
      if (this.registry.isCatalogName(name))
        return false
      await this.send(ctx, `未找到指令 /${name}。发送 /help 查看可用指令。`)
      stop('unknown')
      return true
    }

    const denied = this.deny(ctx, command)
    if (denied) {
      await this.send(ctx, denied)
      stop('denied')
      return true
    }

    const reply = async (text: string) => {
      await this.send(ctx, text)
    }
    const replyMarkdown = async (markdown: string, text?: string) => {
      await this.sendReply(ctx, { markdown, ...(text ? { text } : {}) })
    }
    const commandContext: QQCommandContext = {
      name: command.name,
      scope: 'c2c',
      senderId: ctx.message.senderId,
      messageId: ctx.message.messageId,
      target: ctx.replyTarget,
      message: ctx.message,
      args: parsed.args,
      raw: parsed.raw,
      reply,
      replyMarkdown,
    }

    try {
      const result = await command.action(parsed.args, commandContext)
      for (const item of Array.isArray(result) ? result : result ? [result] : [])
        await this.sendReply(ctx, item)
    }
    catch (error) {
      this.options.onError?.(command.name, error)
      await this.send(ctx, '指令执行失败，请稍后重试。')
    }
    stop('matched')
    return true
  }

  private deny(ctx: InboundContext, command: RegisteredQQCommand) {
    if (ctx.message.senderId !== this.options.owner)
      return '该指令仅限主人私聊使用。'
    if (command.scope === 'group' && ctx.message.kind === 'c2c')
      return '该指令仅限群聊使用。'
    if (command.permission === 'group-admin')
      return '该指令仅限群管理员使用。'
  }

  private async send(ctx: InboundContext, value: string) {
    if (this.options.isPaused?.())
      return
    const text = replyText(value, this.options.maxReplyLength ?? MAX_REPLY)
    if (!text)
      return
    try {
      await ctx.bot.sendText(ctx.replyTarget, text)
    }
    catch (error) {
      this.options.onError?.('reply', error)
    }
  }

  private async sendReply(ctx: InboundContext, value: QQCommandReply) {
    if (typeof value === 'string') {
      await this.send(ctx, value)
      return
    }
    const limit = this.options.maxReplyLength ?? MAX_REPLY
    const markdown = replyText(value.markdown, limit)
    if (!markdown) {
      if (value.text)
        await this.send(ctx, value.text)
      return
    }
    if (this.options.markdown !== false && this.markdownAvailable && typeof ctx.bot.sendMarkdown === 'function') {
      if (this.options.isPaused?.())
        return
      try {
        await ctx.bot.sendMarkdown(ctx.replyTarget, markdown)
        return
      }
      catch (error) {
        if (!markdownUnsupported(error)) {
          this.options.onError?.('markdown', error)
          return
        }
        this.markdownAvailable = false
        this.options.onError?.('markdown-fallback', error)
      }
    }
    await this.send(ctx, value.text ?? markdown)
  }
}
