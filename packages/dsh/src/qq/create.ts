import type { QQCommandRegistry, QQCommandReply, RegisteredQQCommand } from '../qq-commands/registry'
import type { Interaction } from './contracts'
import type { QQGroupImageCacheControl } from './group-image-cache-control'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { groupImageCacheIntent } from './group-image-cache-control'

const MINUTE = 60_000
const MODE_MINUTES = 15
const CARD_MINUTES = 10
const MAX_SHORTCUTS = 12
const MAX_REPLY = 300
const PREFIX = 'el-create:'
const NAME = /^[a-z0-9][\w:-]{0,31}$/u
const HELP = '创造模式目前支持：\n• 加个 /cache，查看群图缓存\n• 加个 /hello，固定回复「你好」\n• 把群图缓存改成 48 小时\n发送 /create list 查看快捷指令，/create exit 退出。'

type Shortcut = { name: string, kind: 'cache' } | { name: string, kind: 'reply', text: string }
type Change = { action: 'add', shortcut: Shortcut } | { action: 'remove', name: string }
type Action = 'confirm' | 'cancel'
interface Mode { until: number }
interface Pending { code: string, until: number, mode: Mode, change: Change }

const normalize = (name: string) => name.replace(/^\//u, '').toLowerCase()
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const describe = (shortcut: Shortcut) => shortcut.kind === 'cache' ? '查看群图缓存设置' : '发送固定文本'
const markdownText = (text: string) => text.replace(/[\x5C`*_{}[\]()~|!#]/gu, '\\$&').replace(/</gu, '＜').replace(/>/gu, '＞')

function validText(text: unknown): text is string {
  return typeof text === 'string' && text.length > 0 && text.length <= MAX_REPLY
    && text === text.trim() && !/[\p{Cc}\p{Cf}]|<@|<qqbot-/iu.test(text)
}

function validShortcut(value: unknown): value is Shortcut {
  return object(value) && typeof value.name === 'string' && NAME.test(value.name)
    && (value.kind === 'cache' ? Object.keys(value).length === 2 : value.kind === 'reply' && validText(value.text) && Object.keys(value).length === 3)
}

export function createButton(event: Interaction): { subject: 'create', action: Action, code: string } | 'invalid' | undefined {
  const { button_id: id, button_data: data } = event.data?.resolved ?? {}
  if (!(typeof data === 'string' && data.startsWith(PREFIX)) && !(typeof id === 'string' && id.startsWith(PREFIX)))
    return
  const match = typeof data === 'string' && /^el-create:(confirm|cancel):([a-f0-9]{16})$/u.exec(data)
  if (!match || id !== PREFIX + match[1])
    return 'invalid'
  return { subject: 'create', action: match[1] === 'confirm' ? 'confirm' : 'cancel', code: match[2] }
}

/** Owner-authenticated by QQPolicy. Shortcut definitions are data, not executable plugin code. */
export class QQCreate {
  private mode?: Mode
  private pending?: Pending
  private shortcuts = new Map<string, Shortcut>()
  private unreadable = false
  private writes = Promise.resolve()
  private configRevision = 0

  constructor(
    private readonly file: string,
    private readonly appId: string,
    private readonly owner: string,
    private readonly registry: QQCommandRegistry,
    private readonly cache: QQGroupImageCacheControl,
    private readonly now = Date.now,
  ) {}

  private active() { return this.mode && this.mode.until > this.now() ? this.mode : undefined }

  async load(onFailure: () => void) {
    try {
      const saved: unknown = JSON.parse(await readFile(this.file, 'utf8'))
      if (!object(saved) || saved.version !== 1 || saved.appId !== this.appId || saved.owner !== this.owner
        || !Array.isArray(saved.shortcuts) || saved.shortcuts.length > MAX_SHORTCUTS || !saved.shortcuts.every(validShortcut)
        || new Set(saved.shortcuts.map(shortcut => shortcut.name)).size !== saved.shortcuts.length) {
        throw new Error('Invalid QQ shortcuts file')
      }
      this.shortcuts = new Map(saved.shortcuts.map(shortcut => [shortcut.name, shortcut]))
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.unreadable = true
        onFailure()
      }
    }
  }

  shortcut(name: string): RegisteredQQCommand | undefined {
    const shortcut = this.shortcuts.get(name)
    if (!shortcut || !this.available(name))
      return
    return {
      name,
      aliases: [],
      description: describe(shortcut),
      examples: [],
      scope: 'c2c',
      permission: 'owner',
      hidden: false,
      action: () => shortcut.kind === 'cache' ? this.cache.command(['show']) : shortcut.text,
    }
  }

  natural(content: string): string[] | undefined {
    if (!this.active())
      return
    const text = content.trim()
    if (/^(?:结束|退出)创造模式[。！!]?$/u.test(text))
      return ['exit']
    const config = groupImageCacheIntent(text)
    if (config?.[1] === 'set')
      return ['config', ...config.slice(2)]
    // Only explicit, short phrases can create a proposal.
    if (text.length > MAX_REPLY + 100 || /[\r\n]/u.test(text))
      return ['help']
    const draft = /^(?:请 ?)?(?:加个|添加|创建|做个) *\/([a-z0-9][\w:-]{0,31})[，, ]+([^，, ].*)$/iu.exec(text)
    if (draft) {
      const [, name, body] = draft
      if (/^(?:用来|用于)?(?:查看|显示)群图缓存(?:设置)?[。！!]?$/u.test(body))
        return ['shortcut', name]
      const reply = /^固定回复 ?「([^」]+)」[。！!]?$/u.exec(body)
      if (reply)
        return ['reply', name, reply[1]]
    }
    return ['help']
  }

  command(args: string[]): Promise<QQCommandReply> {
    return this.serial(() => this.handle(args))
  }

  button(action: Action, code: string) {
    return this.serial(() => this.decide(action, code))
  }

  private serial<T>(operation: () => Promise<T> | T) {
    const next = this.writes.then(operation)
    this.writes = next.then(() => {}, () => {})
    return next
  }

  private available(name: string) {
    try {
      // Ask the real registry about builtins, reserved names and plugin aliases.
      this.registry.command(name)
      return true
    }
    catch { return false }
  }

  private async handle([action = 'start', ...args]: string[]): Promise<QQCommandReply> {
    if (action === 'start' && !args.length) {
      const active = this.active()
      if (active) {
        active.until = this.now() + MODE_MINUTES * MINUTE
      }
      else {
        this.pending = undefined
        this.mode = { until: this.now() + MODE_MINUTES * MINUTE }
      }
      return `已开启创造模式，闲置 ${MODE_MINUTES} 分钟后退出。草稿需要你确认才会生效。\n\n${HELP}`
    }
    if (action === 'exit' && !args.length) {
      this.mode = this.pending = undefined
      return '已退出创造模式。未确认的草稿已失效，已启用的指令仍可使用。'
    }
    if (action === 'status' && !args.length) {
      const active = this.active()
      return active ? `创造模式已开启，约 ${Math.ceil((active.until - this.now()) / MINUTE)} 分钟后退出。\n${HELP}` : '创造模式未开启。私聊发送 /create 开启。'
    }
    if (action === 'list' && !args.length) {
      if (this.unreadable)
        return '快捷指令记录无法读取，已停止加载和修改。'
      const rows = [...this.shortcuts.values()].map(item => `/${item.name}：${describe(item)}${this.available(item.name) ? '' : '（与系统指令重名，已停用）'}`)
      return rows.length ? `已创建的快捷指令：\n${rows.join('\n')}` : '还没有创建快捷指令。'
    }
    if ((action === 'confirm' || action === 'cancel') && args.length === 1)
      return (await this.decide(action, args[0])).text
    const mode = this.active()
    if (!mode)
      return '请先私聊发送 /create 开启创造模式。'
    mode.until = this.now() + MODE_MINUTES * MINUTE
    if (action === 'config' && args.length === 2) {
      this.pending = undefined
      const revision = ++this.configRevision
      return this.cache.command(['set', ...args], () => this.active() === mode && this.configRevision === revision)
    }
    if (action !== 'shortcut' && action !== 'reply' && action !== 'remove')
      return HELP
    if (this.unreadable)
      return '快捷指令记录无法读取，已停止修改。'
    const name = normalize(args[0] ?? '')
    if (!NAME.test(name))
      return '请指定一个有效的斜杠指令名，例如 /cache。'
    if (action === 'remove') {
      if (args.length !== 1 || !this.shortcuts.has(name))
        return '没有找到该快捷指令。发送 /create list 查看。'
      return this.propose(mode, { action: 'remove', name })
    }
    const reply = args.slice(1).join(' ').trim()
    if ((action === 'shortcut' && args.length !== 1) || (action === 'reply' && !validText(reply)))
      return `固定回复须为 ${MAX_REPLY} 字以内的纯文本。\n${HELP}`
    if (!this.available(name) || this.shortcuts.has(name))
      return `/${name} 已被使用，请换一个名字。`
    if (this.shortcuts.size >= MAX_SHORTCUTS)
      return `快捷指令已达 ${MAX_SHORTCUTS} 条，请先移除一条。`
    return this.propose(mode, { action: 'add', shortcut: action === 'reply' ? { name, kind: 'reply', text: reply } : { name, kind: 'cache' } })
  }

  private propose(mode: Mode, change: Change): QQCommandReply {
    this.configRevision++
    const code = randomBytes(8).toString('hex')
    this.pending = { code, until: this.now() + CARD_MINUTES * MINUTE, mode, change }
    const summary = change.action === 'add' ? `添加 /${change.shortcut.name}：${describe(change.shortcut)}` : `移除 /${change.name}`
    const reply = change.action === 'add' && change.shortcut.kind === 'reply' ? `\n\n回复内容：${change.shortcut.text}` : ''
    const button = (action: Action, label: string, style: 0 | 1) => ({
      id: PREFIX + action,
      render_data: { label, visited_label: '已提交', style },
      action: { type: 1 as const, permission: { type: 2 as const }, data: `${PREFIX}${action}:${code}` },
    })
    return {
      markdown: `**确认快捷指令草稿**\n\n${markdownText(summary)}${markdownText(reply)}\n\n> 仅主人私聊可用。确认后立即生效，${CARD_MINUTES} 分钟内有效。`,
      text: `待确认：${summary}${reply}\n仅主人私聊可用。发送 /create confirm ${code} 确认，${CARD_MINUTES} 分钟内有效。`,
      keyboard: { content: { rows: [{ buttons: [button('confirm', '同意修改', 1), button('cancel', '取消', 0)] }] } },
    }
  }

  private async decide(action: Action, code: string) {
    const pending = this.pending
    if (!pending || pending.code !== code || this.active() !== pending.mode || pending.until <= this.now())
      return { accepted: false, text: '这份草稿无效、已过期或已经处理。' }
    if (action === 'cancel') {
      this.pending = undefined
      return { accepted: true, text: '已取消，快捷指令没有变化。' }
    }
    const { change } = pending
    const next = new Map(this.shortcuts)
    const name = change.action === 'add' ? change.shortcut.name : change.name
    if (change.action === 'add') {
      if (!this.available(name) || next.has(name) || next.size >= MAX_SHORTCUTS)
        return { accepted: false, text: '指令名或容量已变化，请重新发起。' }
      next.set(name, change.shortcut)
    }
    else {
      next.delete(name)
    }
    const tmp = `${this.file}.${randomUUID()}.tmp`
    try {
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 })
      const saved = { version: 1, appId: this.appId, owner: this.owner, shortcuts: [...next.values()] }
      await writeFile(tmp, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
      await rename(tmp, this.file)
    }
    catch {
      return { accepted: false, text: '未能保存草稿，快捷指令没有变化。请稍后重试。' }
    }
    finally { await unlink(tmp).catch(() => {}) }
    this.shortcuts = next
    this.pending = undefined
    pending.mode.until = this.now() + MODE_MINUTES * MINUTE
    return { accepted: true, text: change.action === 'add' ? `已启用 /${name}。现在可以在主人私聊中使用。` : `已移除快捷指令 /${name}。` }
  }
}
