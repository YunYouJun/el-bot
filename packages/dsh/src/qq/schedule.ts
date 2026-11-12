import type { ManualTarget } from './manual-types'
import type {
  ScheduleBridge,
  ScheduleDraft,
  ScheduleKind,
  ScheduleLlm,
  ScheduleMessage,
  ScheduleModel,
  ScheduleRequest,
  ScheduleRun,
  ScheduleRunStatus,
  ScheduleStateView,
  ScheduleTask,
} from './schedule-types'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ScheduleError } from './schedule-types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MAX_TASKS = 24
const MAX_GROUP_TASKS = 4
const MAX_RUNS = 200
const MAX_BYTES = 1024 * 1024
const MAX_TEXT = 1200
const MAX_DIGEST = 1200
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

interface DiskState {
  version: 1
  tasks: ScheduleTask[]
  runs: ScheduleRun[]
}

interface ScheduleOptions {
  timezone: string
  now?: () => number
  intervalMs?: number
  paused?: () => boolean
  llm?: ScheduleLlm
  summaryMaxTokens?: number
  summaryTimeoutMs?: number
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(timezone: string) {
  const existing = formatters.get(timezone)
  if (existing)
    return existing
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  })
  formatters.set(timezone, created)
  return created
}

function zonedParts(ms: number, timezone: string): ZonedParts {
  const values = Object.fromEntries(formatter(timezone).formatToParts(new Date(ms)).map(part => [part.type, part.value]))
  const weekday = WEEKDAYS.indexOf(values.weekday as typeof WEEKDAYS[number])
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: weekday < 0 ? 0 : weekday,
  }
}

function offsetAt(ms: number, timezone: string) {
  const parts = zonedParts(ms, timezone)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(ms / 1000) * 1000
}

/** Resolve one wall-clock minute in a timezone without adding a date library. */
function zonedEpoch(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  let guess = Date.UTC(year, month - 1, day, hour, minute)
  for (let index = 0; index < 4; index++) {
    const next = Date.UTC(year, month - 1, day, hour, minute) - offsetAt(guess, timezone)
    if (next === guess)
      break
    guess = next
  }
  return guess
}

function minuteKey(ms: number, timezone: string) {
  const parts = zonedParts(ms, timezone)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

function parseTime(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new ScheduleError(400, 'invalid_time')
  return value
}

function parseDays(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 7)
    throw new ScheduleError(400, 'invalid_time')
  const days = [...new Set(value)].sort((left, right) => left - right)
  if (days.some(day => !Number.isInteger(day) || day < 1 || day > 7))
    throw new ScheduleError(400, 'invalid_time')
  return days
}

function parseKind(value: unknown): ScheduleKind {
  if (value === undefined)
    return 'text'
  if (value !== 'text' && value !== 'summary' && value !== 'digest')
    throw new ScheduleError(400, 'invalid_request')
  return value
}

function parseText(value: unknown, required: boolean): string | undefined {
  if (value === undefined) {
    if (required)
      throw new ScheduleError(400, 'invalid_text')
    return
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT)
    throw new ScheduleError(400, 'invalid_text')
  return value
}

function parseNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = value === undefined ? fallback : value
  if (!Number.isInteger(number) || (number as number) < minimum || (number as number) > maximum)
    throw new ScheduleError(400, 'invalid_window')
  return number as number
}

function parseTarget(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new ScheduleError(400, 'invalid_target')
  return value
}

function isoDay(weekday: number) {
  return weekday === 0 ? 7 : weekday
}

function nextOccurrence(task: ScheduleTask, now: number, timezone: string): number | undefined {
  const parts = zonedParts(now, timezone)
  const [hour, minute] = task.time.split(':').map(Number)
  const base = Date.UTC(parts.year, parts.month - 1, parts.day)
  for (let offset = 0; offset <= 8; offset++) {
    const date = new Date(base + offset * DAY)
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() + 1
    const day = date.getUTCDate()
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    if (!task.days.includes(isoDay(weekday)))
      continue
    const epoch = zonedEpoch(year, month, day, hour, minute, timezone)
    if (epoch > now)
      return epoch
  }
}

function rangeLabel(since: number, until: number, timezone: string) {
  const format = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return `${format.format(new Date(since))} – ${format.format(new Date(until))}`
}

function clean(value: string, maximum: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function failureCode(error: unknown) {
  if (error instanceof ScheduleError)
    return error.code
  const value = error as { code?: unknown, bizCode?: unknown } | undefined
  if (typeof value?.code === 'string' && /^[a-z_]+$/.test(value.code))
    return value.code
  if (typeof value?.bizCode === 'string' || typeof value?.bizCode === 'number')
    return String(value.bizCode)
  return 'send_failed'
}

/** Plain-text digest used when the owner does not want to spend a model call. */
export function renderDigest(title: string, since: number, until: number, rows: ScheduleMessage[], timezone: string) {
  const people = new Map<string, { name: string, count: number }>()
  for (const row of rows) {
    const name = clean(row.senderName || row.senderId || '未知成员', 32)
    const entry = people.get(name) ?? { name, count: 0 }
    entry.count++
    people.set(name, entry)
  }
  const active = [...people.values()].sort((left, right) => right.count - left.count).slice(0, 5)
  const lines = [
    `【群聊摘要】${rangeLabel(since, until, timezone)} · ${clean(title, 40)}`,
    `共 ${rows.length} 条文本消息，${people.size} 位成员发言。`,
    ...active.length ? [`活跃成员：${active.map(item => `${item.name}（${item.count}）`).join('、')}`] : [],
    '最近消息：',
    ...rows.slice(-8).map((row) => {
      const time = new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(row.createdAt))
      return `- ${time} ${clean(row.senderName || row.senderId || '未知成员', 24)}：${clean(row.text, 80)}`
    }),
  ]
  const text = lines.join('\n')
  return text.length > MAX_DIGEST ? `${text.slice(0, MAX_DIGEST - 1)}…` : text
}

export function summaryPrompt(title: string, since: number, until: number, rows: ScheduleMessage[], timezone: string) {
  const lines = rows.map((row) => {
    const time = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(row.createdAt))
    return `[${time}] ${clean(row.senderName || row.senderId || '未知成员', 32)}：${clean(row.text, 240)}`
  })
  const transcript = lines.join('\n').slice(-14_000)
  return `请总结下面这个 QQ 群在一段时间内的讨论，用简体中文输出，直接给结论。

要求：
- 3–6 个要点，覆盖主要话题、结论、待办或悬而未决的问题。
- 只依据记录，不编造；没有实质内容时直说“这段时间没有形成明确讨论”。
- 使用成员昵称，不输出 OpenID、链接、密钥或其他隐私信息。
- 总长度不超过 500 字，不要写“以下是总结”。

群名：${clean(title, 40)}
时间：${rangeLabel(since, until, timezone)}

群聊记录：
${transcript || '（无文本消息）'}`
}

export const SUMMARY_SYSTEM_PROMPT = '你是 QQ 群聊摘要助手。只输出简体中文摘要正文，不输出 Markdown 代码块、工具调用或额外说明。'

/** Owner-only scheduled proactive sends. It is never registered as a model tool. */
export class ScheduleControl {
  private state: DiskState = { version: 1, tasks: [], runs: [] }
  private queue: Promise<unknown> = Promise.resolve()
  private writes: Promise<unknown> = Promise.resolve()
  private timer?: ReturnType<typeof setInterval>
  private tickRunning = false
  private running = new Set<string>()

  private previews = new Map<string, number>()
  private aborts = new Set<AbortController>()
  private broken?: Error
  private closed = false
  private readonly now: () => number
  private readonly timezone: string
  private readonly intervalMs: number

  get active() { return this.tickRunning || this.running.size > 0 }

  constructor(
    readonly path: string,
    private readonly bridge: ScheduleBridge,
    private readonly options: ScheduleOptions,
  ) {
    this.now = options.now ?? Date.now
    this.timezone = options.timezone
    this.intervalMs = options.intervalMs ?? 15_000
  }

  async initialize() {
    try {
      if ((await stat(this.path)).size > MAX_BYTES)
        throw new Error('oversized schedule journal')
      const value = JSON.parse(await readFile(this.path, 'utf8')) as DiskState
      if (value.version !== 1 || !Array.isArray(value.tasks) || !Array.isArray(value.runs)
        || value.tasks.length > MAX_TASKS || value.runs.length > MAX_RUNS
        || value.tasks.some(task => !this.validTask(task))
        || value.runs.some(run => !run || typeof run.id !== 'string' || typeof run.taskId !== 'string'
          || !['sent', 'failed', 'unknown', 'offline'].includes(run.status)
          || !Number.isSafeInteger(run.createdAt))) {
        throw new Error('invalid schedule journal')
      }
      this.state = value
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.broken = error as Error
    }
    this.timer = setInterval(() => {
      void this.tick().catch(() => {})
    }, this.intervalMs)
    this.timer.unref?.()
  }

  private validTask(task: ScheduleTask) {
    return Boolean(task && typeof task.id === 'string' && /^[a-f0-9-]{36}$/i.test(task.id)
      && typeof task.target === 'string' && /^[a-f0-9]{64}$/.test(task.target)
      && typeof task.title === 'string' && task.title.length <= 160
      && ['text', 'summary', 'digest'].includes(task.kind)
      && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(task.time)
      && Array.isArray(task.days) && task.days.length > 0 && task.days.length <= 7
      && task.days.every(day => Number.isInteger(day) && day >= 1 && day <= 7)
      && typeof task.enabled === 'boolean'
      && (task.text === undefined || (typeof task.text === 'string' && task.text.length > 0 && task.text.length <= MAX_TEXT))
      && (task.kind !== 'text' || typeof task.text === 'string')
      && Number.isInteger(task.windowHours) && task.windowHours >= 1 && task.windowHours <= 168
      && Number.isInteger(task.maxMessages) && task.maxMessages >= 20 && task.maxMessages <= 500
      && Number.isSafeInteger(task.createdAt) && Number.isSafeInteger(task.updatedAt))
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task)
    this.queue = result.catch(() => {})
    return result
  }

  private assertAvailable() {
    if (this.closed)
      throw new ScheduleError(503, 'unavailable')
    if (this.broken)
      throw new ScheduleError(503, 'journal_unavailable')
  }

  private save() {
    this.assertAvailable()
    const write = this.writes.then(() => this.write())
    this.writes = write.catch(() => {})
    return write
  }

  private async write() {
    this.state.runs = this.state.runs
      .filter(run => run.createdAt > this.now() - DAY)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, MAX_RUNS)
    const text = `${JSON.stringify(this.state)}\n`
    if (Buffer.byteLength(text) > MAX_BYTES)
      throw new ScheduleError(503, 'journal_unavailable')
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      await writeFile(temporary, text, { mode: 0o600, flag: 'wx' })
      await rename(temporary, this.path)
    }
    catch (error) {
      this.broken = error as Error
      throw new ScheduleError(503, 'journal_unavailable')
    }
    finally {
      await unlink(temporary).catch(() => {})
    }
  }

  private async groups() {
    try {
      return (await this.bridge.targets()).filter(target => target.scope === 'group')
    }
    catch {
      throw new ScheduleError(503, 'unavailable')
    }
  }

  private target(id: string, targets: ManualTarget[]) {
    return targets.find(target => target.scope === 'group' && target.id === id)
  }

  async view(): Promise<ScheduleStateView> {
    this.assertAvailable()
    const now = this.now()
    const targets = await this.groups()
    const byId = new Map(targets.map(target => [target.id, target]))
    return {
      now,
      online: this.bridge.online(),
      timezone: this.timezone,
      targets: targets.map(target => ({ id: target.id, title: target.title, sessionId: target.sessionId, model: this.bridge.model(target) })),
      tasks: this.state.tasks.map(task => ({
        ...task,
        title: byId.get(task.target)?.title ?? task.title,
        nextRunAt: task.enabled ? nextOccurrence(task, now, this.timezone) : undefined,
      })),
      runs: this.state.runs.slice(0, 50),
      ...targets[0] ? { summaryModel: this.bridge.model(targets[0]) } : {},
    }
  }

  private draft(input: ScheduleDraft, current?: ScheduleTask) {
    const target = input.target === undefined ? current?.target : parseTarget(input.target)
    if (!target)
      throw new ScheduleError(400, 'invalid_target')
    const kind = input.kind === undefined ? current?.kind ?? 'text' : parseKind(input.kind)
    const text = input.text === undefined ? current?.text : parseText(input.text, kind === 'text')
    if (kind === 'text' && !text)
      throw new ScheduleError(400, 'invalid_text')
    return {
      target,
      kind,
      text: kind === 'text' ? text : undefined,
      time: input.time === undefined ? current?.time ?? '22:00' : parseTime(input.time),
      days: input.days === undefined ? current?.days ?? [1, 2, 3, 4, 5, 6, 7] : parseDays(input.days),
      enabled: input.enabled === undefined ? current?.enabled ?? true : Boolean(input.enabled),
      windowHours: parseNumber(input.windowHours, current?.windowHours ?? 24, 1, 168),
      maxMessages: parseNumber(input.maxMessages, current?.maxMessages ?? 200, 20, 500),
    }
  }

  async request(input: ScheduleRequest): Promise<unknown> {
    this.assertAvailable()
    if (!input || typeof input !== 'object')
      throw new ScheduleError(400, 'invalid_request')
    return this.serial(async () => {
      if (input.operation === 'list')
        return this.view()
      if (input.operation === 'create') {
        const draft = this.draft(input)
        const targets = await this.groups()
        const target = this.target(draft.target, targets)
        if (!target)
          throw new ScheduleError(400, 'invalid_target')
        if (this.state.tasks.length >= MAX_TASKS)
          throw new ScheduleError(409, 'task_limit')
        if (this.state.tasks.filter(task => task.target === draft.target).length >= MAX_GROUP_TASKS)
          throw new ScheduleError(409, 'group_limit')
        const now = this.now()
        const task: ScheduleTask = {
          id: randomUUID(),
          ...draft,
          title: target.title,
          createdAt: now,
          updatedAt: now,
        }
        this.state.tasks.push(task)
        try {
          await this.save()
        }
        catch (error) {
          this.state.tasks = this.state.tasks.filter(row => row !== task)
          throw error
        }
        return this.view()
      }
      if (input.operation === 'update') {
        const task = this.state.tasks.find(row => row.id === input.id)
        if (!task)
          throw new ScheduleError(404, 'task_not_found')
        const draft = this.draft(input, task)
        const targets = await this.groups()
        const target = this.target(draft.target, targets)
        if (!target)
          throw new ScheduleError(400, 'invalid_target')
        if (draft.target !== task.target
          && this.state.tasks.filter(row => row.target === draft.target && row.id !== task.id).length >= MAX_GROUP_TASKS) {
          throw new ScheduleError(409, 'group_limit')
        }
        Object.assign(task, draft, { title: target.title, updatedAt: this.now() })
        await this.save()
        return this.view()
      }
      if (input.operation === 'delete') {
        const before = this.state.tasks
        this.state.tasks = this.state.tasks.filter(row => row.id !== input.id)
        if (this.state.tasks.length === before.length)
          throw new ScheduleError(404, 'task_not_found')
        this.state.runs = this.state.runs.filter(run => run.taskId !== input.id)
        this.previews.delete(input.id)
        await this.save()
        return this.view()
      }
      if (input.operation === 'run') {
        const task = this.state.tasks.find(row => row.id === input.id)
        if (!task)
          throw new ScheduleError(404, 'task_not_found')
        const slot = this.dueSlot(task, this.now())
        if (slot)
          task.lastRunKey = slot.key
        const run = await this.execute(task)
        return { run, view: await this.view() }
      }
      if (input.operation === 'preview') {
        const task = this.state.tasks.find(row => row.id === input.id)
        if (!task)
          throw new ScheduleError(404, 'task_not_found')
        const now = this.now()
        if (this.previews.size > 64) {
          for (const [id, at] of this.previews) {
            if (at <= now - 10_000) {
              this.previews.delete(id)
            }
          }
        }
        if ((this.previews.get(task.id) ?? 0) > now - 10_000)
          throw new ScheduleError(429, 'rate_limited')
        this.previews.set(task.id, now)
        const target = this.target(task.target, await this.groups())
        if (!target)
          throw new ScheduleError(400, 'invalid_target')
        const since = now - task.windowHours * HOUR
        return {
          id: task.id,
          title: target.title,
          kind: task.kind,
          since,
          until: now,
          text: await this.content(task, target, since, now),
        }
      }
      throw new ScheduleError(400, 'invalid_request')
    })
  }

  async tick() {
    if (this.closed || this.broken || this.tickRunning || this.options.paused?.())
      return
    this.tickRunning = true
    try {
      const now = this.now()
      const due: { task: ScheduleTask, key: string }[] = []
      for (const task of this.state.tasks) {
        if (!task.enabled || this.running.has(task.id))
          continue
        const slot = this.dueSlot(task, now)
        if (slot && task.lastRunKey !== slot.key)
          due.push({ task, key: slot.key })
      }
      if (!due.length)
        return
      for (const { task, key } of due) {
        task.lastRunKey = key
        task.lastRunAt = now
        task.updatedAt = now
        if (!this.bridge.online()) {
          this.record(task, 'offline', 'offline')
        }
      }
      await this.save()
      for (const { task } of due) {
        if (!this.bridge.online())
          continue
        void this.execute(task).catch(() => {})
      }
    }
    finally {
      this.tickRunning = false
    }
  }

  private dueSlot(task: ScheduleTask, now: number) {
    return [now, now - MINUTE]
      .filter(time => now - time <= 90_000)
      .map((time) => {
        const parts = zonedParts(time, this.timezone)
        return {
          key: minuteKey(time, this.timezone),
          clock: `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
          day: isoDay(parts.weekday),
        }
      })
      .find(slot => task.days.includes(slot.day) && task.time === slot.clock)
  }

  private record(task: ScheduleTask, status: ScheduleRunStatus, code?: string, messageId?: string) {
    const run: ScheduleRun = {
      id: randomUUID(),
      taskId: task.id,
      status,
      createdAt: this.now(),
      ...(messageId ? { messageId } : {}),
      ...(code ? { code } : {}),
    }
    this.state.runs.push(run)
    task.lastStatus = status
    task.lastRunAt = this.now()
    task.updatedAt = this.now()
    if (code)
      task.lastCode = code
    else
      delete task.lastCode
    return run
  }

  private async execute(task: ScheduleTask): Promise<ScheduleRun> {
    if (this.options.paused?.())
      throw new ScheduleError(503, 'unavailable')
    if (this.running.has(task.id))
      throw new ScheduleError(409, 'rate_limited')
    this.running.add(task.id)
    try {
      const targets = await this.groups()
      const target = this.target(task.target, targets)
      if (!target)
        throw new ScheduleError(400, 'invalid_target')
      if (!this.bridge.online())
        throw new ScheduleError(503, 'unavailable')
      const now = this.now()
      const since = now - task.windowHours * HOUR
      const text = await this.content(task, target, since, now)
      const response = await this.bridge.send(target, text)
      const run = this.record(task, 'sent', undefined, typeof response?.id === 'string' ? response.id : undefined)
      await this.save()
      return run
    }
    catch (error) {
      const code = failureCode(error)
      const taskRow = this.state.tasks.find(row => row.id === task.id)
      if (taskRow)
        this.record(taskRow, code === 'offline' ? 'offline' : 'failed', code)
      await this.save().catch(() => {})
      if (error instanceof ScheduleError)
        throw error
      throw new ScheduleError(502, code === '40034105' ? 'send_failed' : code)
    }
    finally {
      this.running.delete(task.id)
    }
  }

  private async content(task: ScheduleTask, target: ManualTarget, since: number, now: number) {
    if (task.kind === 'text')
      return task.text!
    const rows = await this.bridge.recent(target, since, now, task.maxMessages)
    if (!rows.length)
      throw new ScheduleError(422, 'summary_empty')
    if (task.kind === 'digest')
      return renderDigest(target.title, since, now, rows, this.timezone)
    const model = this.bridge.model(target)
    if (!model)
      throw new ScheduleError(409, 'model_unavailable')
    return this.summarize(target, model, since, now, rows)
  }

  private async summarize(target: ManualTarget, model: ScheduleModel, since: number, now: number, rows: ScheduleMessage[]) {
    if (!this.options.llm)
      throw new ScheduleError(503, 'summary_failed')
    const controller = new AbortController()
    this.aborts.add(controller)
    const timeout = setTimeout(() => controller.abort(), this.options.summaryTimeoutMs ?? 30_000)
    timeout.unref?.()
    let text = ''
    try {
      for await (const chunk of this.options.llm.stream({
        provider: model.provider,
        model: model.model,
        ...(model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}),
        system: SUMMARY_SYSTEM_PROMPT,
        maxTokens: this.options.summaryMaxTokens ?? 800,
        messages: [{ role: 'user', content: [{ type: 'text', text: summaryPrompt(target.title, since, now, rows, this.timezone) }] }],
        signal: controller.signal,
      })) {
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string')
          text += chunk.text
        if (chunk.type === 'finish' && (chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted'))
          throw new ScheduleError(502, 'summary_failed')
      }
    }
    catch (error) {
      if (error instanceof ScheduleError)
        throw error
      throw new ScheduleError(502, 'summary_failed')
    }
    finally {
      clearTimeout(timeout)
      this.aborts.delete(controller)
    }
    const summary = text.trim()
    if (!summary)
      throw new ScheduleError(502, 'summary_failed')
    return summary.length > MAX_TEXT ? `${summary.slice(0, MAX_TEXT - 1)}…` : summary
  }

  close() {
    this.closed = true
    if (this.timer)
      clearInterval(this.timer)
    this.timer = undefined
    for (const controller of this.aborts)
      controller.abort()
    this.aborts.clear()
  }
}
