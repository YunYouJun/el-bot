import type { Inbound, Target } from '../qq-security/contracts'
import { CommandCatalog } from '@el-bot/commands'

export type QQCommandScope = 'c2c' | 'group' | 'all'
export type QQCommandPermission = 'owner' | 'group-admin' | 'everyone'

export interface QQCommandMarkdownReply {
  readonly markdown: string
  /** Plain fallback used when QQ rejects Markdown or the client cannot render it. */
  readonly text?: string
}

export type QQCommandReply = string | QQCommandMarkdownReply
export type QQCommandResult = QQCommandReply | readonly QQCommandReply[] | void

export interface QQCommandContext {
  readonly name: string
  readonly scope: 'c2c' | 'group'
  readonly senderId: string
  readonly messageId: string
  readonly target: Target
  readonly message: Inbound
  readonly args: readonly string[]
  readonly raw: string
  /** Send another bounded text reply through the same authenticated transport. */
  readonly reply: (text: string) => Promise<void>
  /** Send rich text with an optional plain-text fallback. */
  readonly replyMarkdown: (markdown: string, text?: string) => Promise<void>
}

export type QQCommandAction = (args: string[], context: QQCommandContext) => QQCommandResult | Promise<QQCommandResult>

export interface QQCommandInfo {
  readonly name: string
  readonly aliases: readonly string[]
  readonly description: string
  readonly usage?: string
  readonly examples: readonly string[]
  readonly scope: QQCommandScope
  readonly permission: QQCommandPermission
  readonly hidden: boolean
}

export interface QQCommandDefinition extends Partial<Omit<QQCommandInfo, 'name' | 'aliases'>> {
  readonly name: string | readonly string[]
  readonly action: QQCommandAction
}

export interface RegisteredQQCommand extends QQCommandInfo {
  readonly action: QQCommandAction
}

export interface QQCommandDirectoryEntry extends QQCommandInfo {
  readonly source: 'local' | 'delegated'
}

export interface QQCommandRegistryOptions {
  /** Commands handled by dsh-qqbot itself. They are documented but pass through untouched. */
  readonly catalog?: readonly QQCommandInfo[]
  /** Names another runtime owns and a QQ plugin must not shadow. */
  readonly reserved?: readonly string[]
}

const NAME = /^[a-z0-9][\w:-]{0,31}$/i
const MAX_HELP = 1600

function normalizeQQName(name: string) {
  return name.trim().replace(/^\//u, '').toLowerCase()
}

function validateQQName(name: string) {
  if (!NAME.test(name))
    throw new Error('A QQ command name must be 1-32 letters, numbers, colons, underscores or hyphens')
}

export function isQQCommandMarkdownReply(value: unknown): value is QQCommandMarkdownReply {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { markdown?: unknown }).markdown === 'string'
}

function normalizedNames(names: string | readonly string[]) {
  const values = (Array.isArray(names) ? names : [names]).map(normalizeQQName)
  if (!values.length || values.some(name => !name))
    throw new Error('A QQ command name must be 1-32 letters, numbers, colons, underscores or hyphens')
  for (const name of values)
    validateQQName(name)
  if (new Set(values).size !== values.length)
    throw new Error('A QQ command cannot repeat one of its own aliases')
  return values
}

function oneLine(value: string, limit = 120) {
  return value.replace(/\s+/gu, ' ').replace(/\p{Cc}/gu, '').trim().slice(0, limit)
}

const scopeLabel = (scope: QQCommandScope) => scope === 'c2c' ? '私聊' : scope === 'group' ? '群聊' : '私聊/群聊'
function permissionLabel(permission: QQCommandPermission) {
  return permission === 'owner'
    ? '仅主人'
    : permission === 'group-admin' ? '仅群管理员' : '所有成员'
}

export class QQCommandBuilder {
  private descriptionText = ''
  private usageText = ''
  private exampleList: string[] = []
  private aliasList: string[] = []
  private commandScope: QQCommandScope = 'c2c'
  private commandPermission: QQCommandPermission = 'owner'
  private hiddenCommand = false
  private registered = false
  private disposeRegistration?: () => void

  constructor(private readonly registry: QQCommandRegistry, readonly name: string) {
    normalizedNames(name)
  }

  private mutable() {
    if (this.registered)
      throw new Error(`QQ command "${this.name}" is already registered`)
    return this
  }

  description(text: string) {
    this.mutable().descriptionText = oneLine(text)
    return this
  }

  usage(text: string) {
    this.mutable().usageText = oneLine(text, 200)
    return this
  }

  example(text: string) {
    this.mutable().exampleList.push(oneLine(text, 200))
    return this
  }

  alias(...names: string[]) {
    this.mutable()
    const next = [...this.aliasList, ...names]
    normalizedNames([this.name, ...next])
    this.aliasList = next
    return this
  }

  scope(scope: QQCommandScope) {
    if (!['c2c', 'group', 'all'].includes(scope))
      throw new Error('QQ command scope must be c2c, group or all')
    this.mutable().commandScope = scope
    return this
  }

  permission(permission: QQCommandPermission) {
    if (!['owner', 'group-admin', 'everyone'].includes(permission))
      throw new Error('QQ command permission must be owner, group-admin or everyone')
    this.mutable().commandPermission = permission
    return this
  }

  hidden(hidden = true) {
    this.mutable().hiddenCommand = hidden
    return this
  }

  action(callback: QQCommandAction) {
    this.mutable()
    if (typeof callback !== 'function')
      throw new TypeError('A QQ command action must be a function')
    const dispose = this.registry.add({
      name: this.name,
      aliases: [...this.aliasList],
      description: this.descriptionText,
      usage: this.usageText || undefined,
      examples: [...this.exampleList],
      scope: this.commandScope,
      permission: this.commandPermission,
      hidden: this.hiddenCommand,
      action: callback,
    })
    this.disposeRegistration = dispose
    this.registered = true
    return this
  }

  /** Remove this registration and all of its aliases. Safe to call more than once. */
  readonly dispose = () => {
    this.disposeRegistration?.()
    this.disposeRegistration = undefined
  }
}

/** Explicit, transport-neutral command catalog exposed to Cordis plugins as `qqCommands`. */
export class QQCommandRegistry {
  readonly catalog: readonly QQCommandInfo[]
  private readonly builtins: CommandCatalog<QQCommandInfo>
  private readonly commands: CommandCatalog<RegisteredQQCommand>

  constructor(options: QQCommandRegistryOptions = {}) {
    this.catalog = [...(options.catalog ?? [])]
    this.builtins = new CommandCatalog<QQCommandInfo>({
      normalize: normalizeQQName,
      validate: validateQQName,
    })
    for (const command of this.catalog)
      this.builtins.register({ name: command.name, aliases: command.aliases, payload: command })
    this.commands = new CommandCatalog<RegisteredQQCommand>({
      normalize: normalizeQQName,
      validate: validateQQName,
      reserved: [
        ...(options.reserved ?? []),
        ...this.catalog.flatMap(command => [command.name, ...command.aliases]),
      ],
    })
  }

  command(name: string) {
    const [normalized] = normalizedNames(name)
    if (this.commands.isReserved(normalized))
      throw new Error(`QQ command "${normalized}" is reserved by dsh-qqbot`)
    if (this.commands.has(normalized))
      throw new Error(`QQ command "${normalized}" already exists`)
    return new QQCommandBuilder(this, normalized)
  }

  register(definition: QQCommandDefinition) {
    const [name, ...aliases] = normalizedNames(definition.name)
    const builder = this.command(name)
    if (aliases.length)
      builder.alias(...aliases)
    if (definition.description)
      builder.description(definition.description)
    if (definition.usage)
      builder.usage(definition.usage)
    for (const example of definition.examples ?? [])
      builder.example(example)
    if (definition.scope)
      builder.scope(definition.scope)
    if (definition.permission)
      builder.permission(definition.permission)
    if (definition.hidden)
      builder.hidden()
    builder.action(definition.action)
    return builder
  }

  /** Internal registration path. Builders validate before reaching this method. */
  add(command: RegisteredQQCommand) {
    return this.commands.register({
      name: command.name,
      aliases: command.aliases,
      payload: command,
    })
  }

  resolve(name: string) {
    return this.commands.resolve(name)
  }

  all(): readonly RegisteredQQCommand[] {
    return this.commands.list().map(entry => entry.payload)
  }

  isCatalogName(name: string) {
    return this.builtins.has(name)
  }

  /** Immutable directory used by help and future offline panel inputs. */
  directory(): readonly QQCommandDirectoryEntry[] {
    return [
      ...this.entries('local').map(command => this.directoryEntry(command, 'local')),
      ...this.entries('delegated').map(command => this.directoryEntry(command, 'delegated')),
    ]
  }

  help(query?: string): string {
    if (query) {
      const command = this.find(query)
      if (command)
        return this.detail(command)
      const name = normalizeQQName(query)
      const safe = name.replace(/[^\w:-]/giu, '').slice(0, 32)
      return safe ? `未找到指令 /${safe}。发送 /help 查看可用指令。` : '发送 /help 查看可用指令。'
    }
    const custom = this.visible('local')
    const builtin = this.visible('delegated')
    const lines = ['小云可用指令（发送 /help <指令> 查看用法）', '']
    if (custom.length) {
      lines.push('自定义指令')
      for (const command of custom)
        lines.push(this.line(command))
      lines.push('')
    }
    if (builtin.length) {
      lines.push('DSH / QQ 内置指令')
      for (const command of builtin)
        lines.push(this.line(command))
    }
    return lines.join('\n').trim().slice(0, MAX_HELP)
  }

  /** Rich help rendered with QQ's supported custom Markdown subset. */
  helpMarkdown(query?: string): string {
    if (query) {
      const command = this.find(query)
      if (command)
        return this.markdownDetail(command)
      return `### 未找到指令\n\n${this.help(query)}`
    }
    const custom = this.visible('local')
    const builtin = this.visible('delegated')
    const lines = [
      '### 小云可用指令',
      '> 发送 **/help 指令名** 查看详细用法',
      '',
    ]
    if (custom.length) {
      lines.push('**自定义指令**', '')
      for (const command of custom)
        lines.push(this.markdownLine(command))
      lines.push('')
    }
    if (builtin.length) {
      lines.push('**DSH / QQ 内置指令**', '')
      for (const command of builtin)
        lines.push(this.markdownLine(command))
      lines.push('')
    }
    lines.push('***', '> 指令仅在认证主人的私聊中生效')
    return lines.join('\n').trim().slice(0, MAX_HELP)
  }

  private entries(source: 'local' | 'delegated'): readonly QQCommandInfo[] {
    return source === 'local'
      ? this.commands.list().map(entry => entry.payload)
      : this.builtins.list().map(entry => entry.payload)
  }

  private visible(source: 'local' | 'delegated') {
    return this.entries(source).filter(command => !command.hidden)
  }

  private find(name: string) {
    return this.commands.resolve(name) ?? this.builtins.resolve(name)
  }

  private directoryEntry(command: QQCommandInfo, source: 'local' | 'delegated'): QQCommandDirectoryEntry {
    return {
      name: command.name,
      aliases: [...command.aliases],
      description: command.description,
      ...(command.usage ? { usage: command.usage } : {}),
      examples: [...command.examples],
      scope: command.scope,
      permission: command.permission,
      hidden: command.hidden,
      source,
    }
  }

  private line(command: QQCommandInfo) {
    const description = command.description ? ` — ${command.description}` : ''
    return `/${command.name}${description}（${scopeLabel(command.scope)} · ${permissionLabel(command.permission)}）`
  }

  private markdownLine(command: QQCommandInfo) {
    const description = command.description ? ` — ${command.description}` : ''
    return `- **/${command.name}**${description} · ${scopeLabel(command.scope)} · ${permissionLabel(command.permission)}`
  }

  private detail(command: QQCommandInfo) {
    const lines = [`指令：/${command.name}`, `说明：${command.description || '无'}`]
    if (command.aliases.length)
      lines.push(`别名：${command.aliases.map(name => `/${name}`).join('、')}`)
    if (command.usage) {
      const usage = command.usage.startsWith('/') ? command.usage : `/${command.usage}`
      lines.push(`用法：${usage}`)
    }
    if (command.examples.length)
      lines.push(`示例：${command.examples.join(' | ')}`)
    lines.push(`范围：${scopeLabel(command.scope)}`, `权限：${permissionLabel(command.permission)}`)
    return lines.join('\n').slice(0, MAX_HELP)
  }

  private markdownDetail(command: QQCommandInfo) {
    const lines = [`### /${command.name}`, '', command.description || '无描述', '']
    if (command.aliases.length)
      lines.push(`**别名** ${command.aliases.map(name => `/${name}`).join('、')}`)
    if (command.usage) {
      const usage = command.usage.startsWith('/') ? command.usage : `/${command.usage}`
      lines.push(`**用法** ${usage}`)
    }
    if (command.examples.length)
      lines.push(`**示例** ${command.examples.join(' · ')}`)
    lines.push(`**适用范围** ${scopeLabel(command.scope)}`, `**执行权限** ${permissionLabel(command.permission)}`)
    return lines.join('\n').slice(0, MAX_HELP)
  }
}
