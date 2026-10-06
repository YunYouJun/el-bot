import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { AcpOptions, RpcId, RpcNotification, RpcRequest, ThreadOptions, TurnResult } from './types'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { realpath } from 'node:fs/promises'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { agentEnvironment } from './environment'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface ActiveTurn {
  threadId: string
  id: string
  output: string
  cancelled: boolean
  settled: boolean
  work?: Promise<void>
}

/** ACP v1 adapter: no shell, client filesystem, terminal, or automatic permissions. */
export class AcpClient extends EventEmitter<{
  notification: [RpcNotification]
  request: [RpcRequest]
  disconnect: [Error]
}> {
  readonly provider: 'codebuddy' | 'dsh'
  private child?: ChildProcessWithoutNullStreams
  private initialized?: Promise<void>
  private closing?: Promise<void>
  private disconnected = false
  private nextId = 0
  private capabilities: Record<string, unknown> = {}
  private sessions = new Map<string, string>()
  private active?: ActiveTurn
  private lastTurn?: ActiveTurn
  private permissions = new Map<RpcId, { threadId: string, optionId: string }>()
  private pending = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void, timer?: ReturnType<typeof setTimeout> }>()

  constructor(private options: AcpOptions) {
    super()
    this.provider = options.provider
  }

  start(): Promise<void> {
    if (this.closing)
      return Promise.reject(new Error('Agent is closing'))
    if (this.disconnected)
      return Promise.reject(new Error('Agent is not connected'))
    return this.initialized ??= this.initialize()
  }

  private async initialize() {
    const child = this.child = spawn(this.options.executable ?? this.provider, this.options.args ?? (this.provider === 'codebuddy' ? ['--acp', '--permission-mode', 'default'] : ['--profile', 'acp']), { shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: agentEnvironment(process.env, this.options.envAllowlist), cwd: this.options.projects[0] })
    child.stderr.resume()
    child.stdin.on('error', () => this.fail(new Error('Agent input stream closed')))
    child.once('error', () => this.fail(new Error('Cannot start agent; check local installation')))
    child.once('exit', () => this.fail(new Error('Agent connection closed')))
    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => this.receive(line))
    child.once('exit', () => lines.close())
    try {
      const result = await this.rpc('initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'el-bot', version: '0.1.0' },
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      })
      if (!record(result) || result.protocolVersion !== 1 || !record(result.agentCapabilities))
        throw new Error('Unsupported ACP protocol version')
      this.capabilities = result.agentCapabilities
    }
    catch (error) {
      await this.close()
      throw error
    }
  }

  private send(message: Record<string, unknown>) {
    if (!this.child?.stdin.writable || this.child.killed || this.disconnected)
      throw new Error('Agent is not connected')
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  }

  private rpc(method: string, params: unknown, timeout = this.options.requestTimeoutMs ?? 30000): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = timeout
        ? setTimeout(() => {
            const error = new Error('Agent request timed out')
            this.fail(error)
            this.child?.kill('SIGTERM')
          }, timeout)
        : undefined
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.send({ id, method, params })
      }
      catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  private receive(line: string) {
    try {
      if (line.length > 2_000_000)
        throw new Error('ACP message too large')
      const message: unknown = JSON.parse(line)
      if (!record(message) || message.jsonrpc !== '2.0')
        throw new Error('Invalid ACP message')
      if (typeof message.method === 'string') {
        const params = record(message.params) ? message.params : {}
        if (typeof message.id === 'string' || typeof message.id === 'number') {
          if (message.method === 'session/request_permission')
            this.permission(message.id, params)
          else this.reject(message.id)
        }
        else if (message.method === 'session/update') {
          const turn = this.active
          const update = params.update
          // session/load can replay historical messages; only a live prompt owns output.
          if (turn && !turn.cancelled && params.sessionId === turn.threadId && record(update)
            && update.sessionUpdate === 'agent_message_chunk' && record(update.content)
            && update.content.type === 'text' && typeof update.content.text === 'string') {
            turn.output = (turn.output + update.content.text).slice(-100000)
          }
        }
      }
      else if (typeof message.id === 'number') {
        const request = this.pending.get(message.id)
        if (!request)
          return
        clearTimeout(request.timer)
        this.pending.delete(message.id)
        if (record(message.error)) {
          // Do not expose provider diagnostics, which can contain credentials or prompts.
          request.reject(new Error(message.error.code === -32000 ? 'Agent authentication or session unavailable' : `Agent RPC failed (${String(message.error.code)})`))
        }
        else if (Object.hasOwn(message, 'result')) {
          request.resolve(message.result)
        }
        else {
          request.reject(new Error('Invalid ACP response'))
        }
      }
    }
    catch {
      this.fail(new Error('Invalid ACP output'))
      this.child?.kill('SIGTERM')
    }
  }

  private permission(id: RpcId, params: Record<string, unknown>) {
    const turn = this.active
    const options = params.options
    const once = Array.isArray(options) ? options.find(option => record(option) && option.kind === 'allow_once' && typeof option.optionId === 'string') : undefined
    if (!turn || turn.cancelled || params.sessionId !== turn.threadId || !record(once)
      || !record(params.toolCall) || JSON.stringify(params).length > 100000 || this.permissions.has(id) || this.permissions.size >= 20) {
      this.send({ id, result: { outcome: { outcome: 'cancelled' } } })
      return
    }
    this.permissions.set(id, { threadId: turn.threadId, optionId: String(once.optionId) })
    this.emit('request', {
      id,
      method: 'item/commandExecution/requestApproval',
      params: { threadId: turn.threadId, turnId: turn.id, provider: this.provider, toolCall: params.toolCall, options },
    })
  }

  respond(id: RpcId, result: unknown) {
    const permission = this.permissions.get(id)
    if (!permission)
      return
    this.permissions.delete(id)
    const allowed = record(result) && result.decision === 'accept' && !this.active?.cancelled
      && this.active?.threadId === permission.threadId
    this.send({ id, result: { outcome: allowed ? { outcome: 'selected', optionId: permission.optionId } : { outcome: 'cancelled' } } })
  }

  reject(id: RpcId) {
    this.send({ id, error: { code: -32601, message: 'Unsupported client request' } })
  }

  private supports(name: string): boolean {
    return record(this.capabilities.sessionCapabilities) && record(this.capabilities.sessionCapabilities[name])
  }

  async inspectThread(id: string, cwd: string): Promise<'ready' | 'missing' | 'project-changed' | 'unavailable'> {
    await this.start()
    if (this.sessions.has(id))
      return this.sessions.get(id) === cwd ? 'ready' : 'project-changed'
    if (!this.supports('list'))
      return 'unavailable'
    const cursors = new Set<string>()
    let cursor: string | undefined
    do {
      const result = await this.rpc('session/list', { cwd, ...(cursor ? { cursor } : {}) })
      if (!record(result) || !Array.isArray(result.sessions))
        return 'unavailable'
      const session = result.sessions.find(session => record(session) && session.sessionId === id)
      if (record(session))
        return session.cwd === cwd ? 'ready' : 'project-changed'
      cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined
      if (cursor && (cursors.has(cursor) || cursors.size >= 20))
        return 'unavailable'
      if (cursor)
        cursors.add(cursor)
    } while (cursor)
    return 'missing'
  }

  async thread(options: ThreadOptions): Promise<string> {
    await this.start()
    const cwd = await realpath(options.cwd)
    if (!this.options.projects.includes(cwd))
      throw new Error('Project path is outside the allowlist')
    if (options.threadId && this.sessions.get(options.threadId) === cwd)
      return options.threadId
    const method = !options.threadId ? 'session/new' : this.supports('resume') ? 'session/resume' : this.capabilities.loadSession === true ? 'session/load' : undefined
    if (!method)
      throw new Error('Agent session resume unavailable; use /new')
    const result = await this.rpc(method, { cwd, mcpServers: [], ...(options.threadId ? { sessionId: options.threadId } : {}) })
    const id = options.threadId ?? (record(result) && typeof result.sessionId === 'string' ? result.sessionId : undefined)
    if (!id)
      throw new Error('Invalid ACP session response')
    if (options.model) {
      const selector = record(result) && Array.isArray(result.configOptions)
        ? result.configOptions.find(option => record(option) && option.category === 'model' && typeof option.id === 'string')
        : undefined
      if (record(selector)) {
        await this.rpc('session/set_config_option', { sessionId: id, configId: selector.id, value: options.model })
      }
      else if (record(result) && record(result.models) && Array.isArray(result.models.availableModels)
        && result.models.availableModels.some(model => record(model) && model.modelId === options.model)) {
        await this.rpc('session/set_model', { sessionId: id, modelId: options.model })
      }
      else {
        throw new Error('Agent model selection unavailable; configure the model locally')
      }
    }
    this.sessions.set(id, cwd)
    return id
  }

  async turn(threadId: string, cwd: string, prompt: string): Promise<TurnResult> {
    if (this.closing || this.active || this.sessions.get(threadId) !== cwd)
      throw new Error('Agent task admission failed')
    const turn: ActiveTurn = { threadId, id: randomUUID(), output: '', cancelled: false, settled: false }
    this.active = turn
    this.emit('notification', { method: 'turn/started', params: { threadId, turn: { id: turn.id } } })
    turn.work = this.runPrompt(turn, prompt)
    return { turn: { id: turn.id } }
  }

  private async runPrompt(turn: ActiveTurn, prompt: string) {
    let status = 'failed'
    try {
      const result = await this.rpc('session/prompt', { sessionId: turn.threadId, prompt: [{ type: 'text', text: prompt }] }, 0)
      if (!record(result) || !['end_turn', 'cancelled', 'max_tokens', 'max_turn_requests', 'refusal'].includes(String(result.stopReason)))
        throw new Error('Invalid ACP prompt response')
      turn.settled = true
      status = turn.cancelled || result.stopReason === 'cancelled' ? 'interrupted' : result.stopReason === 'end_turn' ? 'completed' : 'failed'
    }
    catch { /* Settlement failure must not be reported as confirmed cancellation. */ }
    finally {
      for (const [id, permission] of this.permissions) {
        if (permission.threadId === turn.threadId)
          this.respond(id, { decision: 'decline' })
      }
      if (this.active === turn)
        this.active = undefined
      this.lastTurn = turn
      this.emit('notification', { method: 'item/completed', params: { threadId: turn.threadId, turnId: turn.id, item: { id: turn.id, type: 'agentMessage', phase: 'final_answer', text: turn.output } } })
      this.emit('notification', { method: 'turn/completed', params: { threadId: turn.threadId, turn: { id: turn.id, status } } })
    }
  }

  async interrupt(threadId: string, turnId: string): Promise<void> {
    const turn = this.active
    if (!turn) {
      if (this.disconnected || this.lastTurn?.threadId !== threadId || this.lastTurn.id !== turnId || !this.lastTurn.settled)
        throw new Error('Agent stop unconfirmed')
      return
    }
    if (turn.threadId !== threadId || turn.id !== turnId)
      throw new Error('Agent task mismatch')
    turn.cancelled = true
    for (const id of this.permissions.keys()) this.respond(id, { decision: 'decline' })
    this.send({ method: 'session/cancel', params: { sessionId: threadId } })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([turn.work, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Agent stop timed out')), this.options.requestTimeoutMs ?? 30000)
      })])
      if (!turn.settled)
        throw new Error('Agent stop unconfirmed')
    }
    finally { clearTimeout(timer) }
  }

  async request<T = unknown>(method: string, params: unknown): Promise<T> {
    // Never expose unrestricted ACP calls through the Codex management command surface.
    if (method === 'thread/read' && record(params) && typeof params.threadId === 'string') {
      const cwd = this.sessions.get(params.threadId)
      if (cwd)
        return { thread: { id: params.threadId, cwd } } as T
    }
    throw new Error('Codex management API unavailable for this agent')
  }

  async steer(): Promise<never> { throw new Error('ACP steering unavailable') }
  async review(): Promise<never> { throw new Error('Codex review API unavailable for this agent') }
  async forkThread(): Promise<never> { throw new Error('ACP session fork unavailable') }

  private fail(error: Error) {
    if (this.disconnected)
      return
    this.disconnected = true
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
    this.permissions.clear()
    this.emit('disconnect', error)
  }

  close(): Promise<void> {
    return this.closing ??= this.finishClose()
  }

  private async finishClose() {
    const child = this.child
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
      return
    if (this.active)
      await this.interrupt(this.active.threadId, this.active.id).catch(() => {})
    if (!this.disconnected && this.supports('close')) {
      for (const sessionId of this.sessions.keys())
        await this.rpc('session/close', { sessionId }).catch(() => {})
    }
    if (child.exitCode !== null || child.signalCode !== null)
      return
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      timer = setTimeout(() => {
        child.kill('SIGKILL')
        timer = setTimeout(() => reject(new Error('Agent process shutdown unconfirmed')), 3000)
      }, 3000)
      child.kill('SIGTERM')
    })
  }
}
