import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type {
  CodexOptions,
  ReviewTarget,
  RpcId,
  RpcNotification,
  RpcRequest,
  ThreadOptions,
  ThreadResult,
  TurnResult,
} from './types'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { codexEnvironment } from './environment'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Owns a stdio process or a proxy connection; never opens a network listener. */
export class CodexClient extends EventEmitter<{
  notification: [RpcNotification]
  request: [RpcRequest]
  disconnect: [Error]
}> {
  private child?: ChildProcessWithoutNullStreams
  private nextId = 0
  private initialized?: Promise<void>
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  constructor(private options: CodexOptions = {}) {
    super()
  }

  start(): Promise<void> {
    return (this.initialized ??= this.initialize())
  }

  private async initialize() {
    const env = codexEnvironment(process.env, this.options)
    const child = (this.child = spawn(
      this.options.executable ?? 'codex',
      this.options.args ?? (this.options.connection === 'desktop'
        ? ['app-server', 'proxy', ...(this.options.socketPath ? ['--sock', this.options.socketPath] : [])]
        : ['app-server']),
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env,
      },
    ))
    // Consume stderr without leaking account or project data into bot replies.
    child.stderr.resume()
    child.stdin.on('error', () =>
      this.fail(new Error('Codex input stream closed')))
    child.once('error', () =>
      this.fail(
        new Error('Cannot start Codex; check executable and codex login'),
      ))
    child.once('exit', code =>
      this.fail(new Error(`Codex app-server exited (${code ?? 'signal'})`)))
    const lines = createInterface({ input: child.stdout })
    lines.on('line', line => this.receive(line))
    child.once('exit', () => lines.close())
    try {
      await this.request('initialize', {
        clientInfo: { name: 'el_bot_qq', title: 'El Bot QQ', version: '0.1.0' },
        ...(this.options.experimentalApi || this.options.terminalControl ? { capabilities: { experimentalApi: true } } : {}),
      })
      this.send({ method: 'initialized', params: {} })
    }
    catch (error) {
      await this.close()
      throw error
    }
  }

  private receive(line: string) {
    try {
      const message: unknown = JSON.parse(line)
      if (!record(message))
        throw new Error('Invalid Codex protocol message')
      if (typeof message.method === 'string') {
        const params = record(message.params) ? message.params : {}
        if (typeof message.id === 'string' || typeof message.id === 'number') {
          this.emit('request', {
            id: message.id,
            method: message.method,
            params,
          })
        }
        else {
          this.emit('notification', { method: message.method, params })
        }
      }
      else if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id)
        if (!pending)
          return
        clearTimeout(pending.timer)
        this.pending.delete(message.id)
        if (record(message.error)) {
          pending.reject(
            new Error(
              `Codex RPC error ${message.error.code}: ${String(message.error.message)}`,
            ),
          )
        }
        else {
          pending.resolve(message.result)
        }
      }
    }
    catch {
      this.fail(new Error('Invalid Codex app-server output'))
      this.child?.kill()
    }
  }

  private send(message: unknown) {
    if (!this.child || this.child.killed || !this.child.stdin.writable)
      throw new Error('Codex app-server is not connected')
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  request<T = unknown>(method: string, params: unknown): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        const error = new Error(`Codex request timed out: ${method}`)
        reject(error)
        this.fail(error)
        this.child?.kill()
      }, this.options.requestTimeoutMs ?? 30000)
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timer,
      })
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

  respond(id: RpcId, result: unknown) {
    this.send({ id, result })
  }

  reject(id: RpcId) {
    this.send({
      id,
      error: { code: -32601, message: 'Unsupported client request' },
    })
  }

  async thread(options: ThreadOptions): Promise<string> {
    return this.openThread(options, options.threadId ? 'thread/resume' : 'thread/start')
  }

  async forkThread(options: ThreadOptions & { threadId: string }): Promise<string> {
    return this.openThread(options, 'thread/fork')
  }

  private async openThread(options: ThreadOptions, method: string): Promise<string> {
    await this.start()
    const params = {
      cwd: options.cwd,
      model: options.model,
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sandbox: 'workspace-write',
      // Override local config that could otherwise silently enable network access.
      config: { 'sandbox_workspace_write.network_access': false },
    }
    const result = await this.request<ThreadResult>(method, {
      ...params,
      ...(options.threadId ? { threadId: options.threadId } : {}),
    })
    if (!result.thread?.id || result.thread.cwd !== options.cwd)
      throw new Error('Codex returned an unexpected project directory')
    return result.thread.id
  }

  turn(
    threadId: string,
    cwd: string,
    text: string,
    model?: string,
  ): Promise<TurnResult> {
    return this.request('turn/start', {
      threadId,
      cwd,
      model,
      input: [{ type: 'text', text }],
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [cwd],
        networkAccess: false,
      },
    })
  }

  async interrupt(threadId: string, turnId: string, commandItemIds?: readonly string[]) {
    const result = await this.request('turn/interrupt', { threadId, turnId })
    if (commandItemIds === undefined)
      return result
    if (!this.options.terminalControl && !this.options.experimentalApi)
      throw new Error('Terminal control is required to confirm command cancellation')
    const terminals = await this.terminals(threadId)
    for (const terminal of terminals) {
      if (commandItemIds.includes(terminal.itemId))
        await this.request('thread/backgroundTerminals/terminate', { threadId, processId: terminal.processId })
    }
    if ((await this.terminals(threadId)).some(terminal => commandItemIds.includes(terminal.itemId)))
      throw new Error('Command termination could not be confirmed')
    return result
  }

  private async terminals(threadId: string): Promise<{ itemId: string, processId: string }[]> {
    const terminals: { itemId: string, processId: string }[] = []
    const seen = new Set<string>()
    let cursor: string | undefined
    do {
      const result = await this.request('thread/backgroundTerminals/list', { threadId, ...(cursor ? { cursor } : {}), limit: 100 })
      if (!record(result) || !Array.isArray(result.data))
        throw new Error('Invalid terminal listing')
      for (const item of result.data) {
        if (!record(item) || typeof item.itemId !== 'string' || typeof item.processId !== 'string')
          throw new Error('Invalid terminal identity')
        terminals.push({ itemId: item.itemId, processId: item.processId })
      }
      if (result.nextCursor != null && typeof result.nextCursor !== 'string')
        throw new Error('Invalid terminal cursor')
      cursor = result.nextCursor || undefined
      if (cursor && (seen.has(cursor) || seen.size >= 100))
        throw new Error('Terminal listing did not complete')
      if (cursor)
        seen.add(cursor)
    } while (cursor)
    return terminals
  }

  async review(threadId: string, target: ReviewTarget): Promise<TurnResult> {
    const result = await this.request<TurnResult & { reviewThreadId: string }>('review/start', { threadId, target, delivery: 'inline' })
    if (result.reviewThreadId !== threadId)
      throw new Error('Codex returned an unexpected review thread')
    return result
  }

  steer(threadId: string, turnId: string, text: string) {
    return this.request('turn/steer', { threadId, expectedTurnId: turnId, input: [{ type: 'text', text }] })
  }

  private fail(error: Error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
    this.emit('disconnect', error)
  }

  async close() {
    const child = this.child
    if (!child || child.exitCode !== null || child.signalCode !== null)
      return
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 3000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
