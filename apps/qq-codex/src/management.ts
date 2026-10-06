import type { AgentClient, CodexDesktopClient, CodexSchema } from '@el-bot/codex'
import type { RemoteConfig, ReplyContext } from './types'
import { randomBytes } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { isRecord } from 'qq-sdk/official'
import { cardPages } from './cards'

/** Only reviewed, known read operations run without an extra confirmation. */
const READ_METHODS = new Set([
  'thread/list',
  'thread/read',
  'thread/loaded/list',
  'thread/turns/list',
  'thread/items/list',
  'thread/goal/get',
  'thread/queue/list',
  'thread/backgroundTerminals/list',
  'project/list',
  'project/read',
  'threadSection/list',
  'skills/list',
  'hooks/list',
  'model/list',
  'modelProvider/capabilities/read',
  'permissionProfile/list',
  'collaborationMode/list',
  'experimentalFeature/list',
  'app/list',
  'app/read',
  'app/installed',
  'plugin/list',
  'plugin/read',
  'plugin/search',
  'plugin/installed',
  'plugin/share/list',
  'plugin/skill/read',
  'mcpServerStatus/list',
  'mcpServer/resource/read',
  'config/read',
  'configRequirements/read',
  'account/read',
  'account/rateLimits/read',
  'account/usage/read',
  'account/workspaceMessages/read',
  'fs/readFile',
  'fs/readDirectory',
  'fs/getMetadata',
  'remoteControl/status/read',
])
const READ_TOOLS = new Set([
  'list_projects',
  'list_threads',
  'list_archived_threads',
  'read_thread',
  'list_artifacts',
  'get_usage_limits',
  'get_worktree_creation_status',
  'get_handoff_status',
  'wait_threads',
])
/** These operations must go through task admission and its existing approval lifecycle. */
const TASK_METHODS = new Set(['initialize', 'thread/start', 'thread/resume', 'thread/fork', 'turn/start', 'turn/steer', 'review/start', 'thread/queue/start', 'thread/realtime/start'])
/** Require explicit local permission for APIs that can escape task policy or handle secrets. */
const PRIVILEGED = /^(?:account\/(?:login|logout|bedrock|sendAddCredits|rateLimitReset)|config\/(?:value\/write|batchWrite)|process\/|command\/|thread\/(?:shellCommand|inject_items|approveGuardianDeniedAction|settings\/update|memoryMode\/set)|turn\/settings\/update|remoteControl\/|environment\/|externalAgentConfig\/|memory\/|userVerification\/|feedback\/)/
const PATH_KEY = /^(?:cwd|cwds|path|paths|filePath|directory|root|roots|writableRoots|readableRoots|runtimeWorkspaceRoots|sourcePath|destinationPath|srcPath|destPath|targetPath)$/i

/** Never echo credentials, opaque auth state, environment values or local paths to QQ. */
export function redact(value: unknown, roots: string[] = []): unknown {
  if (typeof value === 'string') {
    if (/^\s*[[{]/.test(value)) {
      try {
        const parsed: unknown = JSON.parse(value)
        if (isRecord(parsed) || Array.isArray(parsed))
          return JSON.stringify(redact(parsed, roots))
      }
      catch {}
    }
    let text = value
    for (const root of [...roots].sort((a, b) => b.length - a.length))
      text = text.split(root).join('[项目目录]')
    return text.replace(/\b(?:Bearer\s+\S+|sk-[\w-]+)/gi, '[已隐藏]')
      .replace(/(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s"'<>]*/g, '[本机路径]')
  }
  if (Array.isArray(value))
    return value.map(item => redact(item, roots))
  if (!isRecord(value))
    return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, (/secret|password|credential|api.?key|authorization|^env$|^email$/i.test(key) || (/token/i.test(key) && typeof item === 'string'))
    ? '[已隐藏]'
    : redact(item, roots)]))
}

interface Operation {
  id: string
  label: string
  pages: string[]
  viewed: Set<number>
  execute: () => Promise<unknown>
  timer: ReturnType<typeof setTimeout>
}

/** Owner/dedup are checked by the parent before entering this command surface. */
export class ManagementController {
  private pending?: Operation
  private running = false
  private work?: Promise<void>
  private closed = false
  private output = new Map<string, string[]>()
  private events: unknown[] = []

  constructor(
    private config: RemoteConfig,
    private codex: AgentClient,
    private schema: CodexSchema | undefined,
    private desktop: CodexDesktopClient | undefined,
    private current: () => string,
    private taskBusy: () => boolean,
    private say: (reply: ReplyContext, text: string) => Promise<boolean>,
  ) {
    codex.on('notification', (event) => {
      this.events.push(redact(event, Object.values(config.projects)))
      this.events = this.events.slice(-50)
    })
  }

  get busy(): boolean {
    return !!this.pending || this.running
  }

  get status(): string | undefined {
    return this.pending ? `管理请求 ${this.pending.id}：${this.pending.label}\n/inspect ${this.pending.id} 查看 · /cancel ${this.pending.id} 取消` : this.running ? '管理操作执行中。' : undefined
  }

  /** Reserve synchronous admission before starting any asynchronous validation/network work. */
  accept(command: string, args: string[], reply: ReplyContext, text = [command, ...args].join(' ')): boolean {
    if (!['/api', '/rpc', '/desktop', '/models', '/skills', '/plugins', '/mcp', '/threads', '/events', '/inspect', '/confirm', '/cancel', '/manage-result'].includes(command))
      return false
    if (this.codex.provider) {
      void this.say(reply, '当前程序支持任务、项目续聊、审批与停止。Codex API / Desktop 管理命令仅适用于 Codex。')
      return true
    }
    if (this.closed)
      return true
    if (this.running) {
      void this.say(reply, '管理操作正在执行，请等待结果。')
      return true
    }
    this.running = true
    this.work = this.handle(command, args, reply, text).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : ''
      const hint = /explicit local permission/.test(message)
        ? '该接口需在本机 management.allowedMethods 中明确许可。'
        : /task admission/.test(message)
          ? '任务接口请使用 /run、/steer、/review 和 /thread。'
          : /[Pp]ath|[Tt]hread.*project|project path/.test(message)
            ? '请确认目标路径和会话属于执行项目白名单。'
            : /parameters|arguments|JSON|Unexpected/.test(message)
              ? '参数需符合 schema；用 /api schema 或 /desktop schema 查阅。'
              : /not enabled/.test(message)
                ? '请在本机配置 management.enabled=true 并重启服务。'
                : /unavailable/.test(message)
                  ? '当前宿主未提供该工具，请用 /desktop tools 查看。'
                  : '可能是权限、版本或连接问题，请运行本机 check 或 desktop-check。'
      await this.say(reply, `管理操作未完成。${hint}不会自动重试。`)
    }).finally(() => { this.running = false })
    return true
  }

  private async handle(command: string, args: string[], reply: ReplyContext, text: string) {
    if (command === '/inspect' || command === '/confirm' || command === '/cancel') {
      const operation = this.pending
      if (!operation || operation.id !== args[0]) {
        await this.say(reply, '管理请求不存在或已过期。')
        return
      }
      if (command === '/inspect') {
        await this.inspect(operation, Number(args[1] ?? 1), reply)
        return
      }
      if (command === '/cancel') {
        this.clear()
        await this.say(reply, '已取消管理请求。')
        return
      }
      if (operation.viewed.size !== operation.pages.length) {
        await this.say(reply, `请先用 /inspect ${operation.id} 页码 查看全部 ${operation.pages.length} 页。`)
        return
      }
      if (this.taskBusy())
        throw new Error('A task is running')
      // Remove before execution: duplicate buttons, failures and timeouts never replay writes.
      this.clear()
      await this.result(operation.id, await operation.execute(), reply)
      return
    }
    if (command === '/manage-result') {
      const parts = this.output.get(args[0])
      await this.page(parts ?? ['结果不存在或已过期。'], Number(args[1] ?? 1), `/manage-result ${args[0]}`, reply)
      return
    }
    if (command === '/events') {
      await this.page(cardPages(JSON.stringify(this.events, null, 2).slice(-100000)), Number(args[0] ?? 1), '/events', reply)
      return
    }
    if (command === '/api') {
      if (!this.schema) {
        await this.say(reply, '请在本机配置 management.enabled=true，并重启服务以生成当前 Codex 的 API 目录。')
        return
      }
      if (args[0] === 'schema' || args[0] === 'type') {
        const params = args[0] === 'type' ? (this.schema.schema.definitions as Record<string, unknown>)[args[1]] : this.schema.params(args[1])
        await this.page(cardPages(JSON.stringify(params ?? '未知 API / 类型', null, 2)), Number(args[2] ?? 1), `/api ${args[0]} ${args[1]}`, reply)
      }
      else {
        const prefix = args[0] ?? ''
        const names = this.schema.methods.filter(name => name.startsWith(prefix))
        await this.page(cardPages(`本机协议：${names.length} 个方法\n${names.join('\n')}\n/api schema 方法 · /rpc 方法 JSON\n写操作需 /inspect 与 /confirm；特殊权限由本机 allowedMethods 控制。`), Number(args[1] ?? 1), `/api ${prefix}`, reply)
      }
      return
    }
    if (command === '/desktop') {
      await this.desktopCommand(args, reply, text)
      return
    }
    const aliases: Record<string, { method: string, params: Record<string, unknown> }> = {
      '/models': { method: 'model/list', params: { ...(args[0] ? { cursor: args[0] } : {}) } },
      '/skills': { method: 'skills/list', params: { cwds: [this.cwd] } },
      '/plugins': { method: 'plugin/list', params: { cwds: [this.cwd] } },
      '/mcp': { method: 'mcpServerStatus/list', params: { ...(args[0] ? { cursor: args[0] } : {}) } },
      '/threads': { method: 'thread/list', params: { cwd: this.cwd, ...(args[0] ? { cursor: args[0] } : {}) } },
    }
    const call = aliases[command] ?? { method: args[0], params: this.parse(text.replace(/^\/rpc\s+\S+\s*/, '')) }
    if (!this.schema)
      throw new Error('Management API catalog is not enabled')
    this.schema.assert(call.method, call.params)
    await this.guard(call.method, call.params)
    const execute = async () => {
      await this.guard(call.method, call.params)
      return this.codex.request(call.method, call.params)
    }
    if (READ_METHODS.has(call.method))
      await this.result(randomBytes(4).toString('hex'), await execute(), reply)
    else await this.stage(call.method, call.params, execute, reply)
  }

  private get cwd() { return this.config.projects[this.current()] }

  private parse(text: string): Record<string, unknown> {
    const value: unknown = JSON.parse(text || '{}')
    if (!isRecord(value) || text.length > 20000)
      throw new Error('Expected a bounded JSON object')
    return value
  }

  private async guard(method: string, params: Record<string, unknown>) {
    if (TASK_METHODS.has(method))
      throw new Error('Use /run or /thread use to preserve task admission')
    if (PRIVILEGED.test(method) && !READ_METHODS.has(method) && !this.config.management?.allowedMethods.includes(method))
      throw new Error('This API requires explicit local permission')
    if (method === 'thread/list') {
      if (params.cwd !== undefined && params.cwd !== this.cwd)
        throw new Error('Thread browsing is restricted to the selected project')
      params.cwd = this.cwd
    }
    if (typeof params.threadId === 'string') {
      const result = await this.codex.request('thread/read', { threadId: params.threadId, includeTurns: false })
      if (!isRecord(result) || !isRecord(result.thread) || typeof result.thread.cwd !== 'string')
        throw new Error('Cannot verify the thread project')
      await this.path(result.thread.cwd)
    }
    await this.paths(params)
    if (method.startsWith('fs/') && !Object.keys(params).some(key => PATH_KEY.test(key)))
      throw new Error('Filesystem APIs require a project path')
    // Never execute arbitrary commands through an API with an implicit server cwd.
    if (/^(?:command\/exec|process\/spawn|thread\/shellCommand)$/.test(method)) {
      if (params.cwd !== this.cwd)
        throw new Error('Explicit current-project cwd required')
    }
  }

  private async paths(value: unknown, key = ''): Promise<void> {
    if (typeof value === 'string' && PATH_KEY.test(key)) {
      await this.path(value)
    }
    else if (Array.isArray(value)) {
      for (const item of value)
        await this.paths(item, key)
    }
    else if (isRecord(value)) {
      for (const [name, item] of Object.entries(value))
        await this.paths(item, name)
    }
  }

  private async path(path: string) {
    if (!isAbsolute(path))
      throw new Error('Absolute allowlisted paths required')
    let candidate = resolve(path)
    const suffix: string[] = []
    while (true) {
      try {
        candidate = resolve(await realpath(candidate), ...suffix.reverse())
        break
      }
      catch (error) {
        if (!isRecord(error) || error.code !== 'ENOENT' || dirname(candidate) === candidate)
          throw new Error('Cannot resolve project path')
        suffix.push(candidate.slice(dirname(candidate).length + (dirname(candidate) === sep ? 0 : 1)))
        candidate = dirname(candidate)
      }
    }
    if (!Object.values(this.config.projects).some((root) => {
      const child = relative(root, candidate)
      return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child))
    })) {
      throw new Error('Path is outside the project allowlist')
    }
  }

  private async desktopCommand(args: string[], reply: ReplyContext, text: string) {
    if (!this.desktop) {
      await this.say(reply, '桌面适配器未配置。请按文档设置 desktop.server、pipePath 和专用 threadId，再运行 el-bot codex desktop-check。')
      return
    }
    if (!args[0] || args[0] === 'tools') {
      const tools = await this.desktop.listTools()
      await this.page(cardPages(`桌面宿主：${tools.length} 个工具\n${tools.map(tool => tool.name).join('\n')}\n/desktop schema 名称 · /desktop call 名称 JSON`), Number(args[1] ?? 1), '/desktop tools', reply)
      return
    }
    if (args[0] === 'schema') {
      const tool = await this.desktop.tool(args[1])
      await this.page(cardPages(JSON.stringify({ description: tool.description, inputSchema: tool.inputSchema }, null, 2)), Number(args[2] ?? 1), `/desktop schema ${args[1]}`, reply)
      return
    }
    const name = args[0] === 'projects' ? 'list_projects' : args[0] === 'chats' ? 'list_threads' : args[1]
    const params = args[0] === 'call' ? this.parse(text.replace(/^\/desktop\s+call\s+\S+\s*/, '')) : {}
    if (!['projects', 'chats', 'call'].includes(args[0]))
      throw new Error('Unknown desktop command')
    const tool = await this.desktop.tool(name)
    await this.desktop.assert(name, params)
    // Native schemas can contain capabilities outside this machine; those are not imported into the allowlist.
    await this.paths(params)
    const execute = async () => {
      await this.paths(params)
      return this.desktop!.call(name, params)
    }
    if (READ_TOOLS.has(tool.name))
      await this.result(randomBytes(4).toString('hex'), await execute(), reply)
    else await this.stage(`desktop/${name}`, params, execute, reply)
  }

  private async stage(label: string, params: unknown, execute: Operation['execute'], reply: ReplyContext) {
    if (this.pending || this.taskBusy()) {
      await this.say(reply, '已有任务或待确认管理请求，请先完成或取消。')
      return
    }
    const id = randomBytes(4).toString('hex')
    const details = JSON.stringify(redact({ operation: label, arguments: params }, Object.values(this.config.projects)), null, 2)
    if (details.length > 100000)
      throw new Error('Operation review too large')
    const operation: Operation = {
      id,
      label,
      execute,
      pages: cardPages(details),
      viewed: new Set(),
      timer: setTimeout(() => {
        if (this.pending === operation)
          this.clear()
      }, 10 * 60 * 1000),
    }
    this.pending = operation
    await this.inspect(operation, 1, reply)
  }

  private async inspect(operation: Operation, page: number, reply: ReplyContext) {
    if (!Number.isInteger(page) || !operation.pages[page - 1]) {
      await this.say(reply, '页码无效。')
      return
    }
    const sent = await this.say(reply, `待确认管理请求 ${operation.id} (${page}/${operation.pages.length})\n${operation.pages[page - 1]}\n/inspect ${operation.id} 页码\n/confirm ${operation.id} 确认本次 · /cancel ${operation.id} 取消`)
    if (sent && this.pending === operation)
      operation.viewed.add(page)
  }

  private async result(id: string, value: unknown, reply: ReplyContext) {
    const text = JSON.stringify(redact(value, Object.values(this.config.projects)), null, 2) ?? '操作已完成。'
    const parts = cardPages(text.length <= 100000 ? text : `${text.slice(0, 100000)}\n结果过长，已截断。`)
    this.output.set(id, parts)
    if (this.output.size > 20)
      this.output.delete(this.output.keys().next().value!)
    await this.page(parts, 1, `/manage-result ${id}`, reply)
  }

  private async page(parts: string[], page: number, command: string, reply: ReplyContext) {
    if (!Number.isInteger(page) || !parts[page - 1]) {
      await this.say(reply, '页码无效。')
      return
    }
    await this.say(reply, `管理结果 (${page}/${parts.length})\n${parts[page - 1]}\n${command} 页码`)
  }

  private clear() {
    if (this.pending)
      clearTimeout(this.pending.timer)
    this.pending = undefined
  }

  async close() {
    this.closed = true
    this.clear()
    await this.desktop?.close()
    await this.work
  }
}
