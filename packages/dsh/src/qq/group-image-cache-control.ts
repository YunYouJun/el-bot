import type { QQCommandReply } from '../qq-commands/registry'
import type { QQGroupImageCacheSettings } from './contracts'
import type { QQGroupImageCache } from './group-image-cache'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { GROUP_IMAGE_CACHE_LIMITS, groupImageCacheOptions } from './group-image-cache'

const CONFIRM_MINUTES = 10
export const CACHE_BUTTON_PREFIX = 'el-group-images:cache-'
type Field = keyof QQGroupImageCacheSettings
type NumberField = Exclude<Field, 'enabled'>
type Action = 'confirm' | 'cancel'
const usage = '私聊发送「查看群图缓存」或「把群图缓存改成 48 小时」。也可以用 /group-images cache set 参数 值。'
const labels: Record<Field, string> = {
  enabled: '群图缓存',
  ttlHours: '保留和引用回查时长',
  maxImageMiB: '单张缓存上限',
  maxMiB: '缓存总容量',
  maxEntries: '缓存张数上限',
  cleanupMinutes: '定期清理间隔',
}
const units: Record<NumberField, string> = { ttlHours: '小时', maxImageMiB: 'MiB', maxMiB: 'MiB', maxEntries: '张', cleanupMinutes: '分钟' }
const phrases: Record<string, NumberField> = {
  保留时长: 'ttlHours',
  保留时间: 'ttlHours',
  单张上限: 'maxImageMiB',
  总容量: 'maxMiB',
  张数上限: 'maxEntries',
  清理间隔: 'cleanupMinutes',
}
interface Pending { code: string, until: number, field: Field, before: number | boolean, after: number | boolean, active?: () => boolean }

function format(field: Field, value: number | boolean) {
  return field === 'enabled' ? (value ? '开启' : '关闭') : `${value} ${units[field]}`
}

/** Recognize explicit owner commands without asking a model to interpret a configuration change. */
export function groupImageCacheIntent(content: string): string[] | undefined {
  const trimmed = content.trim()
  if (trimmed.length > 200 || /[\r\n]/u.test(trimmed))
    return
  const text = trimmed.replace(/[ \t\u3000]+/gu, ' ').replace(/[。！!？?]$/u, '').trimEnd()
  if (/^(?:(?:请 ?)?(?:查看|查询|显示) ?群图缓存(?:设置|配置)?|群图缓存(?:设置|配置|现在是多少小时))$/u.test(text))
    return ['cache', 'show']
  const toggle = /^(?:请 ?)?(开启|关闭) ?群图缓存$/u.exec(text)
  if (toggle)
    return ['cache', 'set', 'enabled', toggle[1] === '开启' ? 'on' : 'off']
  const change = /^(?:请 ?)?(?:把 ?)?群图缓存 ?(?:(保留时长|保留时间|单张上限|总容量|张数上限|清理间隔) ?)?(?:改成|改为|设为|设置为) ?(\d+) ?(小时|MiB|张|分钟)$/iu.exec(text)
  if (change) {
    const field = change[1] ? phrases[change[1]] : 'ttlHours'
    if (units[field].toLowerCase() === change[3].toLowerCase())
      return ['cache', 'set', field, change[2]]
    return ['cache', 'help']
  }
  if (/^(?:请 ?)?(?:把 ?)?群图缓存.{0,24}(?:改成|改为|设为|设置为)/u.test(text))
    return ['cache', 'help']
}

export class QQGroupImageCacheControl {
  private readonly base: QQGroupImageCache['settings']
  private overrides: QQGroupImageCacheSettings = {}
  private pending?: Pending
  private unreadable = false
  private writes = Promise.resolve()

  constructor(
    private readonly file: string,
    private readonly appId: string,
    private readonly owner: string,
    private readonly cache: QQGroupImageCache,
    private readonly now = Date.now,
  ) { this.base = cache.settings }

  async load(onFailure: () => void) {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8')) as {
        version?: unknown
        appId?: unknown
        owner?: unknown
        overrides?: QQGroupImageCacheSettings
      } | null
      if (saved?.version !== 1 || saved.appId !== this.appId || saved.owner !== this.owner || !saved.overrides)
        throw new Error('Invalid QQ group image cache settings')
      groupImageCacheOptions(saved.overrides)
      await this.cache.configure(groupImageCacheOptions({ ...this.base, ...saved.overrides }))
      this.overrides = saved.overrides
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.unreadable = true
        onFailure()
      }
    }
  }

  command(args: string[], active?: () => boolean): Promise<QQCommandReply> {
    return this.serial(() => this.handle(args, active))
  }

  button(action: Action, code: string) {
    return this.serial(() => this.decide(action, code))
  }

  private serial<T>(operation: () => Promise<T> | T) {
    const next = this.writes.then(operation)
    this.writes = next.then(() => {}, () => {})
    return next
  }

  private async handle([action = 'show', ...args]: string[], active?: () => boolean): Promise<QQCommandReply> {
    if (action === 'show' && !args.length) {
      const settings = this.cache.settings
      const details = (Object.keys(labels) as Field[]).map(field => `${labels[field]}：${format(field, settings[field])}`)
      return [details.join('\n'), ...(this.unreadable ? ['已保存的覆盖设置无法读取，目前使用基础配置，暂不可修改。'] : [])].join('\n')
    }
    if ((action === 'confirm' || action === 'cancel') && args.length === 1)
      return (await this.decide(action, args[0])).text
    if (action !== 'set' || args.length !== 2 || !Object.hasOwn(labels, args[0]))
      return usage
    if (this.unreadable)
      return '已保存的群图缓存设置无法读取，暂不可修改。'
    const field = args[0] as Field
    const raw = args[1]
    let after: number | boolean
    if (field === 'enabled') {
      if (raw !== 'on' && raw !== 'off')
        return '群图缓存开关请输入 on 或 off。'
      after = raw === 'on'
    }
    else {
      after = /^\d{1,4}$/u.test(raw) ? Number(raw) : 0
      if (after < 1 || after > GROUP_IMAGE_CACHE_LIMITS[field])
        return `${labels[field]}须为 1–${GROUP_IMAGE_CACHE_LIMITS[field]} 的整数（${units[field]}）。`
    }
    const before = this.cache.settings[field]
    if (after === before) {
      this.pending = undefined
      return `${labels[field]}已经是${format(field, before)}，无需修改。`
    }
    const code = randomBytes(8).toString('hex')
    this.pending = { code, until: this.now() + CONFIRM_MINUTES * 60_000, field, before, after, active }
    const change = `${labels[field]}：${format(field, before)} → ${format(field, after)}`
    const shrink = field !== 'cleanupMinutes' && typeof before === 'number' && typeof after === 'number' && after < before
    const note = shrink ? '确认后立即应用新限制，超出的旧缓存会自动清理。' : '确认后立即生效，无需重启。'
    const button = (action: Action, label: string, style: 0 | 1) => ({
      id: CACHE_BUTTON_PREFIX + action,
      render_data: { label, visited_label: '已提交', style },
      action: { type: 1 as const, permission: { type: 2 as const }, data: `${CACHE_BUTTON_PREFIX}${action}:${code}` },
    })
    return {
      markdown: `**确认修改群图缓存**\n\n${change}\n\n${note}\n\n> 仅主人可确认，${CONFIRM_MINUTES} 分钟内有效。`,
      text: `待确认：${change}。\n${note}\n私聊发送 /group-images cache confirm ${code} 确认，${CONFIRM_MINUTES} 分钟内有效。`,
      keyboard: { content: { rows: [{ buttons: [button('confirm', '同意修改', 1), button('cancel', '取消', 0)] }] } },
    }
  }

  private async decide(action: Action, code: string) {
    const pending = this.pending
    if (!pending || pending.code !== code || pending.until <= this.now() || pending.active?.() === false)
      return { accepted: false, text: '这条缓存设置申请无效、已过期或已经处理。' }
    if (action === 'cancel') {
      this.pending = undefined
      return { accepted: true, text: '已取消，群图缓存设置没有变化。' }
    }
    const overrides = { ...this.overrides, [pending.field]: pending.after }
    const next = groupImageCacheOptions({ ...this.base, ...overrides })
    const tmp = `${this.file}.${randomUUID()}.tmp`
    try {
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 })
      await writeFile(tmp, `${JSON.stringify({ version: 1, appId: this.appId, owner: this.owner, overrides }, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
      await rename(tmp, this.file)
    }
    catch {
      return { accepted: false, text: '未能保存设置，群图缓存没有变化。请稍后重试。' }
    }
    finally { await unlink(tmp).catch(() => {}) }
    await this.cache.configure(next)
    this.overrides = overrides
    this.pending = undefined
    return { accepted: true, text: `已生效：${labels[pending.field]}已改为${format(pending.field, pending.after)}。无需重启。` }
  }
}
