import type { CodexClient, CodexDesktopClient, CodexSchema, ReviewTarget, RpcNotification, RpcRequest } from '@el-bot/codex'
import type { C2CMessage, QQBotClient } from 'qq-sdk/official'
import type {
  CardImagePublisher,
  FailureCode,
  PendingApproval,
  RemoteConfig,
  RemoteState,
  ReplyCard,
  ReplyContext,
  Task,
} from './types'
import { randomBytes } from 'node:crypto'
import { isRecord } from 'qq-sdk/official'
import { acceptedCard, approvalCard, cardPages, helpCard, projectsCard, resultCard, statusCard } from './cards'
import { HELP_COMMANDS } from './constants'
import { failureCode, failureText } from './failures'
import { ManagementController } from './management'
import { ReplySender } from './reply'
import { inspectSession, sessionSummary } from './sessions'

export class RemoteController {
  readonly pairingCode = randomBytes(16).toString('hex')
  private pairingExpires = Date.now() + 10 * 60 * 1000
  private inbox = Promise.resolve()
  private active?: Task
  private replyContext?: ReplyContext
  private cancelled = false
  private closed = false
  private stopping = false
  private approvals = new Map<string, PendingApproval>()
  private items = new Map<string, unknown>()
  private runPromise?: Promise<void>
  private interrupting?: { task: Task, promise: Promise<void>, commands: string[] }
  private turnFailure?: { turnId: string, code: FailureCode }
  private sender: ReplySender
  private management: ManagementController

  constructor(
    private config: RemoteConfig,
    readonly state: RemoteState,
    qq: Pick<QQBotClient, 'reply'>,
    private codex: CodexClient,
    private save: (state: RemoteState) => Promise<void>,
    private onError: (error: unknown) => void,
    integrations: { schema?: CodexSchema, desktop?: CodexDesktopClient, images?: CardImagePublisher } = {},
  ) {
    this.sender = new ReplySender(qq, config.messageFormat, onError, integrations.images)
    this.management = new ManagementController(config, codex, integrations.schema, integrations.desktop, () => state.project, () => !!this.active || this.closed || this.stopping, (reply, text) => this.say(reply, text))
    if (config.ownerOpenId && state.owner && config.ownerOpenId !== state.owner) {
      throw new Error(
        'Configured owner differs from saved owner; explicit local reset is required',
      )
    }
    state.owner ??= config.ownerOpenId
    if (!Object.hasOwn(config.projects, state.project))
      state.project = config.defaultProject
    codex.on('notification', notice => this.notification(notice))
    codex.on('request', request => this.request(request))
    codex.on('disconnect', (error) => {
      this.closed = true
      if (this.active) {
        void this.finish(
          this.interrupting ? 'failed' : this.stopping ? 'interrupted' : 'failed',
          this.stopping && !this.interrupting ? '遥控服务已停止。' : undefined,
          this.interrupting ? 'stop-unconfirmed' : this.stopping ? undefined : failureCode(error, 'connection'),
        ).catch(this.onError)
      }
    })
  }

  /** Serialize admission, not task execution: /stop remains usable during turns. */
  accept(message: C2CMessage): Promise<void> {
    if (this.stopping)
      return Promise.resolve()
    const work = this.inbox.then(() => this.handle(message))
    this.inbox = work.catch(this.onError)
    return work
  }

  private async handle(message: C2CMessage) {
    const text = message.content.trim()
    const openId = message.author.user_openid
    // Replayed old prompts must not create new work even after bounded dedup eviction.
    const age = Date.now() - Date.parse(message.timestamp)
    if (age > 5 * 60 * 1000 || age < -60 * 1000)
      return
    if (!this.state.owner) {
      if (
        Date.now() > this.pairingExpires
        || text !== `/pair ${this.pairingCode}`
      ) {
        return
      }
      this.state.owner = openId
      this.pairingExpires = 0
      await this.persist()
      void this.say(
        { message, sequence: 0 },
        helpCard(this.state.project, 1, openId, '绑定成功。以下按钮仅限本人操作。')!,
      )
      return
    }
    if (openId !== this.state.owner)
      return
    const key = `${openId}:${message.id}`
    if (this.state.seen.includes(key))
      return
    this.state.seen.push(key)
    this.state.seen = this.state.seen.slice(-10000)
    // Persist dedup before executing any user action. A crash never auto-replays it.
    await this.persist()
    const reply = { message, sequence: 0 }
    this.replyContext = reply
    const [command, ...args] = text.split(/\s+/)
    if (HELP_COMMANDS.has(command) && (command.startsWith('/') || text === command)) {
      void this.say(reply, helpCard(this.state.project, Number(args[0] ?? 1), openId) ?? '帮助页码无效。发送 /help 查看第一页。')
      return
    }
    if (command === '/projects') {
      void this.say(reply, projectsCard(Object.keys(this.config.projects), this.state.project, Number(args[0] ?? 1), openId) ?? '项目页码无效。发送 /projects 查看第一页。')
      return
    }
    if (command === '/status') {
      const task = this.active ?? this.state.tasks.at(-1)
      const card = statusCard(this.state.project, task, [...this.approvals.values()], Number(args[0] ?? 1), openId, this.management.status)
      void this.say(reply, card ?? '页码无效。发送 /status 查看第一页。')
      return
    }
    if (command === '/diagnose') {
      const project = args[0] ?? this.state.project
      if (!Object.hasOwn(this.config.projects, project)) {
        void this.say(reply, '未知项目。使用 /projects 查看允许的项目。')
        return
      }
      if (this.closed) {
        void this.say(reply, 'Codex 连接已断开。请在本机运行 el-bot codex check --all，并重启 start；沿用原 profile 或路径。未重试任务。')
        return
      }
      const check = await inspectSession(this.codex, project, this.config.projects[project], this.state.threads[project])
      void this.say(reply, helpCard(this.state.project, 2, openId, `QQ 入站正常，主人校验通过。\n${sessionSummary(check)}\n本机登录、模型与 QQ API 检查：el-bot codex check --all。未运行模型任务。`)!)
      return
    }
    if (command === '/result') {
      void this.result(reply, args).catch(this.onError)
      return
    }
    if (
      command === '/approval'
      || command === '/approve'
      || command === '/reject'
      || command === '/answer'
    ) {
      void this.approvalCommand(command, args, reply).catch(this.onError)
      return
    }
    if (command === '/stop') {
      if (!this.active) {
        void this.say(reply, '没有运行中的任务。')
        return
      }
      if (args[0] && args[0] !== this.active.id) {
        void this.say(reply, '该任务已结束，旧按钮不会停止当前任务。发送 /status 查看。')
        return
      }
      this.cancelled = true
      this.clearApprovals()
      if (this.active.threadId && this.active.turnId)
        void this.interruptTask(this.active)
      void this.say(reply, '已请求停止，正在确认当前任务的命令已终止。使用 /status 查看最终状态。')
      return
    }
    if (command === '/steer') {
      const task = this.active
      const input = text.slice(6).trim()
      if (!task?.threadId || !task.turnId || this.cancelled || !input || input.length > 20000) {
        void this.say(reply, '请在任务执行中使用 /steer 提示词（1–20000 个字符）。')
        return
      }
      void this.codex.steer(task.threadId, task.turnId, input)
        .then(() => this.say(reply, '已补充当前任务。'))
        .catch(() => this.say(reply, '无法补充该任务；任务可能已结束，请用 /status 确认。不会自动重试。'))
      return
    }
    if (this.management.accept(command, args, reply, text))
      return
    if (command.startsWith('/') && !['/run', '/project', '/new', '/thread', '/review'].includes(command)) {
      void this.say(reply, helpCard(this.state.project, 1, openId, '未知命令。请选择快捷操作或查看以下用法。')!)
      return
    }
    if (this.closed) {
      void this.say(reply, 'Codex 服务已断开，请在本机重启遥控服务。')
      return
    }
    if (this.active || this.management.busy) {
      void this.say(
        reply,
        this.active ? `任务 ${this.active.id} 正在执行。可用 /status、/stop。` : '管理操作正在执行或等待确认，请先完成或取消。',
      )
      return
    }
    if (command === '/project') {
      if (!args[0] || !Object.hasOwn(this.config.projects, args[0])) {
        void this.say(reply, '未知项目。使用 /projects 查看允许的项目。')
        return
      }
      this.state.project = args[0]
      await this.persist()
      void this.say(reply, `已切换到 ${args[0]}。`)
      return
    }
    if (command === '/new') {
      const project = args[0] ?? this.state.project
      if (!Object.hasOwn(this.config.projects, project)) {
        void this.say(reply, '未知项目。使用 /projects 查看允许的项目。')
        return
      }
      delete this.state.threads[project]
      await this.persist()
      void this.say(reply, '下一条任务将创建新会话。历史结果仍可查询。')
      return
    }
    if (command === '/thread') {
      if (args[0] === 'fork' && this.state.threads[this.state.project]) {
        try {
          const saved = this.state.threads[this.state.project]
          if (saved.cwd !== this.config.projects[this.state.project])
            throw new Error('Project path changed')
          const id = await this.codex.forkThread({ cwd: saved.cwd, threadId: saved.id, model: this.config.model })
          this.state.threads[this.state.project] = { id, cwd: saved.cwd }
          await this.persist()
          void this.say(reply, '已复制历史到新会话并绑定当前项目；下一条任务继续新会话。')
        }
        catch {
          void this.say(reply, '无法分叉该会话，请检查本机版本和项目配置。不会自动重试。')
        }
        return
      }
      if (args[0] !== 'use' || !args[1]) {
        void this.say(reply, '/threads 查看会话；/thread use ID 绑定已有会话；/thread fork 复制当前项目会话。')
        return
      }
      try {
        const result = await this.codex.request('thread/read', { threadId: args[1], includeTurns: false })
        if (!isRecord(result) || !isRecord(result.thread) || result.thread.id !== args[1] || result.thread.cwd !== this.config.projects[this.state.project])
          throw new Error('Thread belongs to another project')
        this.state.threads[this.state.project] = { id: args[1], cwd: this.config.projects[this.state.project] }
        await this.persist()
        void this.say(reply, '已绑定当前项目的会话；下一条任务继续此会话。')
      }
      catch {
        void this.say(reply, '无法绑定该会话。请确认会话存在且属于当前白名单项目。')
      }
      return
    }
    let review: ReviewTarget | undefined
    if (command === '/review') {
      try {
        const target: unknown = JSON.parse(text.slice(7).trim() || '{"type":"uncommittedChanges"}')
        if (!isRecord(target) || text.length > 20000)
          throw new Error('Invalid review target')
        if (target.type === 'uncommittedChanges')
          review = { type: target.type }
        else if (target.type === 'baseBranch' && typeof target.branch === 'string' && target.branch)
          review = { type: target.type, branch: target.branch }
        else if (target.type === 'commit' && typeof target.sha === 'string' && target.sha)
          review = { type: target.type, sha: target.sha, ...(typeof target.title === 'string' ? { title: target.title } : {}) }
        else if (target.type === 'custom' && typeof target.instructions === 'string' && target.instructions)
          review = { type: target.type, instructions: target.instructions }
        else throw new Error('Unsupported review target')
      }
      catch {
        void this.say(reply, '/review 默认审查未提交改动；也可传入 baseBranch、commit 或 custom 的目标 JSON。用 /api type ReviewTarget 查阅。')
        return
      }
    }
    const prompt = command === '/run' ? text.slice(4).trim() : text
    if (!prompt || prompt.length > 20000) {
      void this.say(reply, '提示词需要 1–20000 个字符。')
      return
    }
    const task: Task = {
      id: randomBytes(4).toString('hex'),
      project: this.state.project,
      status: 'starting',
      output: '',
      createdAt: new Date().toISOString(),
    }
    this.active = task
    this.cancelled = false
    this.items.clear()
    this.turnFailure = undefined
    this.state.tasks.push(task)
    this.state.tasks = this.state.tasks.slice(-20)
    await this.persist()
    void this.say(reply, acceptedCard(task, openId))
    this.runPromise = this.run(task, prompt, review)
      .catch(async (error: unknown) => {
        const code = failureCode(error)
        if (this.active === task) {
          await this.finish(
            'failed',
            undefined,
            code,
          )
        }
        else {
          this.onError(new Error(failureText(code)))
        }
      })
      .catch(this.onError)
  }

  private async run(task: Task, prompt: string, review?: ReviewTarget) {
    const cwd = this.config.projects[task.project]
    const saved = this.state.threads[task.project]
    if (saved && saved.cwd !== cwd)
      throw new Error('Project path changed; use /new before resuming')
    if (saved) {
      const check = await inspectSession(this.codex, task.project, cwd, saved)
      if (check.status !== 'ready')
        throw new Error(check.status === 'archived' ? 'Session is archived' : check.status === 'missing' ? 'Thread not found' : check.status === 'project-changed' ? 'Project path changed' : 'Cannot read stored session')
    }
    const threadId = await this.codex.thread({
      cwd,
      threadId: saved?.id,
      model: this.config.model,
    })
    if (this.active !== task)
      return
    task.threadId = threadId
    this.state.threads[task.project] = { id: threadId, cwd }
    await this.persist()
    if (this.cancelled) {
      await this.finish('interrupted', '任务在启动前被停止。')
      return
    }
    const result = review
      ? await this.codex.review(threadId, review)
      : await this.codex.turn(
          threadId,
          cwd,
          prompt,
          this.config.model,
        )
    if (this.active !== task)
      return
    if (!result.turn?.id)
      throw new Error('Invalid turn/start response')
    task.turnId = result.turn.id
    task.status = 'running'
    await this.persist()
    if (this.cancelled)
      await this.interruptTask(task)
  }

  private notification({ method, params }: RpcNotification) {
    const task = this.active
    if (!task || params.threadId !== task.threadId)
      return
    if (method === 'serverRequest/resolved') {
      for (const [token, approval] of this.approvals) {
        if (approval.request.id === params.requestId) {
          clearTimeout(approval.timer)
          this.approvals.delete(token)
        }
      }
    }
    if (
      method === 'turn/started'
      && isRecord(params.turn)
      && typeof params.turn.id === 'string'
    ) {
      task.turnId = params.turn.id
      task.status = 'running'
    }
    if (params.turnId && task.turnId && params.turnId !== task.turnId)
      return
    if (method === 'error' && typeof params.turnId === 'string' && isRecord(params.error)) {
      // Codex may retry internally. Only turn/completed decides the final task status.
      this.turnFailure = { turnId: params.turnId, code: failureCode(params.error) }
    }
    if (
      (method === 'item/started' || method === 'item/completed')
      && isRecord(params.item)
    ) {
      const item = params.item
      if (typeof item.id === 'string') {
        this.items.set(item.id, item)
        if (item.type === 'commandExecution' && this.interrupting?.task === task && !this.interrupting.commands.includes(item.id))
          this.interrupting.commands.push(item.id)
      }
      if (
        method === 'item/completed'
        && item.type === 'agentMessage'
        && typeof item.text === 'string'
      ) {
        task.output = (
          item.phase === 'final_answer'
            ? item.text
            : `${task.output}\n${item.text}`
        ).slice(-100000)
        void this.persist().catch(this.onError)
      }
      if (method === 'item/completed' && item.type === 'exitedReviewMode' && typeof item.review === 'string') {
        task.output = item.review.slice(-100000)
        void this.persist().catch(this.onError)
      }
    }
    if (
      method === 'turn/completed'
      && isRecord(params.turn)
      && (!task.turnId || params.turn.id === task.turnId)
    ) {
      const status = params.turn.status
      if (this.cancelled) {
        task.turnId ??= String(params.turn.id)
        void this.interruptTask(task)
        return
      }
      void this.finish(
        status === 'completed'
          ? 'completed'
          : status === 'interrupted'
            ? 'interrupted'
            : 'failed',
        undefined,
        status === 'failed'
          ? failureCode(params.turn.error, this.turnFailure && this.turnFailure.turnId === params.turn.id ? this.turnFailure.code : 'unknown')
          : undefined,
      ).catch(this.onError)
    }
  }

  private interruptTask(task: Task): Promise<void> {
    if (this.interrupting?.task === task)
      return this.interrupting.promise
    const commandItems = [...this.items].filter(([, item]) => isRecord(item) && item.type === 'commandExecution').map(([id]) => id)
    // Defer the RPC until the latch is installed: turn/completed may arrive first.
    const promise = Promise.resolve().then(async () => {
      try {
        await this.codex.interrupt(task.threadId!, task.turnId!, commandItems)
        if (this.active === task)
          await this.finish('interrupted', '已确认当前任务的终端命令已终止。')
      }
      catch {
        this.closed = true
        if (this.active === task)
          await this.finish('failed', undefined, 'stop-unconfirmed')
      }
    }).catch(this.onError)
    this.interrupting = { task, promise, commands: commandItems }
    return promise
  }

  private request(request: RpcRequest) {
    const task = this.active
    if (
      !task
      || request.params.threadId !== task.threadId
      || (task.turnId && request.params.turnId !== task.turnId)
      || this.cancelled
    ) {
      this.deny(request)
      return
    }
    const kind
      = request.method === 'item/tool/requestUserInput' ? 'input' : 'approval'
    if (
      ![
        'item/commandExecution/requestApproval',
        'item/fileChange/requestApproval',
        'item/tool/requestUserInput',
      ].includes(request.method)
    ) {
      this.deny(request)
      return
    }
    if (request.method === 'item/fileChange/requestApproval' && !this.items.has(String(request.params.itemId))) {
      this.deny(request)
      this.onError(new Error('Rejected a file approval without its change details'))
      return
    }
    const token = randomBytes(4).toString('hex')
    const detail = JSON.stringify(
      {
        method: request.method,
        ...request.params,
        item: this.items.get(String(request.params.itemId)),
      },
      null,
      2,
    )
    if (detail.length > 100000) {
      this.deny(request)
      return
    }
    const approval: PendingApproval = {
      token,
      request,
      kind,
      pages: cardPages(detail),
      viewed: new Set(),
      timer: setTimeout(
        () => {
          this.approvals.delete(token)
          this.deny(request)
        },
        10 * 60 * 1000,
      ),
    }
    this.approvals.set(token, approval)
    if (this.replyContext)
      void this.showApproval(approval, 1, this.replyContext).catch(this.onError)
  }

  private deny(request: RpcRequest) {
    try {
      if (request.method === 'item/tool/requestUserInput') {
        this.codex.respond(request.id, { answers: {} })
      }
      else if (request.method === 'item/permissions/requestApproval') {
        this.codex.respond(request.id, { permissions: {}, scope: 'turn' })
      }
      else if (request.method === 'mcpServer/elicitation/request') {
        this.codex.respond(request.id, { action: 'decline' })
      }
      else if (
        request.method === 'item/commandExecution/requestApproval'
        || request.method === 'item/fileChange/requestApproval'
      ) {
        this.codex.respond(request.id, { decision: 'decline' })
      }
      else {
        this.codex.reject(request.id)
      }
    }
    catch (error) {
      this.onError(error)
    }
  }

  private clearApprovals() {
    for (const item of this.approvals.values()) {
      clearTimeout(item.timer)
      this.deny(item.request)
    }
    this.approvals.clear()
  }

  private async showApproval(
    approval: PendingApproval,
    page: number,
    reply: ReplyContext,
  ) {
    if (!Number.isInteger(page) || page < 1 || page > approval.pages.length) {
      await this.say(reply, '页码无效。')
      return
    }
    const sent = await this.say(reply, approvalCard(approval, page, reply.message.author.user_openid))
    if (sent)
      approval.viewed.add(page)
  }

  private async approvalCommand(
    command: string,
    args: string[],
    reply: ReplyContext,
  ) {
    const item = this.approvals.get(args[0])
    if (!item) {
      await this.say(reply, '请求不存在或已过期。使用 /status 查看。')
      return
    }
    if (command === '/approval') {
      await this.showApproval(item, Number(args[1] ?? 1), reply)
      return
    }
    if (command === '/approve' && item.kind === 'approval') {
      if (item.viewed.size !== item.pages.length) {
        await this.say(
          reply,
          `请先用 /approval ${item.token} 页码 查看全部 ${item.pages.length} 页。`,
        )
        return
      }
      this.codex.respond(item.request.id, { decision: 'accept' })
    }
    else if (command === '/reject') {
      this.deny(item.request)
    }
    else if (command === '/answer' && item.kind === 'input') {
      try {
        const answers: unknown = JSON.parse(args.slice(1).join(' '))
        const questions = item.request.params.questions
        if (
          !isRecord(answers)
          || !Array.isArray(questions)
          || !questions.every(
            q =>
              isRecord(q)
              && typeof q.id === 'string'
              && typeof answers[q.id] === 'string',
          )
        ) {
          throw new Error('Missing answers')
        }
        const result = Object.fromEntries(
          questions.map((q: Record<string, unknown>) => [
            String(q.id),
            { answers: [answers[String(q.id)]] },
          ]),
        )
        this.codex.respond(item.request.id, { answers: result })
      }
      catch {
        await this.say(reply, '请提供 JSON 对象，包含全部问题 ID 和文字回答。')
        return
      }
    }
    else {
      await this.say(reply, '命令与请求类型不匹配。')
      return
    }
    clearTimeout(item.timer)
    this.approvals.delete(item.token)
    await this.say(reply, '已处理该请求。')
  }

  private async result(reply: ReplyContext, args: string[]) {
    const task = args[0]
      ? this.state.tasks.find(task => task.id === args[0])
      : this.state.tasks.at(-1)
    if (!task) {
      await this.say(reply, '未找到任务。')
      return
    }
    const page = Number(args[1] ?? 1)
    const card = resultCard(task, page, reply.message.author.user_openid)
    if (!card) {
      await this.say(reply, `页码无效，共 ${cardPages(task.output || '暂无文本结果。').length} 页。`)
      return
    }
    await this.say(reply, card)
  }

  private async finish(status: Task['status'], message?: string, failure?: FailureCode) {
    const task = this.active
    if (!task)
      return
    this.active = undefined
    if (this.interrupting?.task === task)
      this.interrupting = undefined
    task.status = status
    if (failure) {
      task.failure = failure
      task.output = `${task.output}\n${failureText(failure)}`.slice(-100000)
      this.onError(new Error(`Task ${task.id}: ${failureText(failure)}`))
    }
    if (message)
      task.output = `${task.output}\n${message}`.slice(-100000)
    this.clearApprovals()
    this.items.clear()
    this.turnFailure = undefined
    await this.persist()
    if (this.replyContext) {
      await this.say(
        this.replyContext,
        resultCard(task, 1, this.replyContext.message.author.user_openid)!,
      )
    }
  }

  private say(context: ReplyContext, message: string | ReplyCard): Promise<boolean> {
    return this.sender.send(context, message)
  }

  private async persist() {
    try {
      await this.save(this.state)
    }
    catch (error) {
      this.closed = true
      throw error
    }
  }

  async close() {
    this.stopping = true
    await this.inbox
    this.closed = true
    this.cancelled = true
    this.clearApprovals()
    const closingManagement = this.management.close()
    if (this.active?.threadId && this.active.turnId) {
      await this.interruptTask(this.active)
    }
    await this.codex.close()
    await closingManagement
    await this.runPromise
    if (this.active)
      await this.finish('interrupted', '遥控服务已停止。')
    await this.persist()
  }
}
