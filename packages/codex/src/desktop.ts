import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { Ajv } from 'ajv'

export interface DesktopOptions {
  /** The Codex-bundled codex-app-tools/server.mjs file. */
  server: string
  /** Supplied by the running desktop host, never guessed or scanned. */
  pipePath: string
  /** Dedicated, existing desktop chat that owns tool calls. */
  threadId: string
  requestTimeoutMs?: number
}

export interface DesktopTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean }
}

/** Standard MCP client for the app's bundled adapter; host enforces its own access checks. */
export class CodexDesktopClient extends EventEmitter<{ disconnect: [Error] }> {
  private child?: ChildProcessWithoutNullStreams
  private initialized?: Promise<void>
  private nextId = 0
  private pending = new Map<number, { resolve: (value: any) => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout> }>()
  private tools = new Map<string, DesktopTool>()

  constructor(readonly options: DesktopOptions) {
    super()
  }

  start(): Promise<void> {
    return this.initialized ??= this.initialize()
  }

  private async initialize() {
    const env: NodeJS.ProcessEnv = { ...process.env, CODEX_APP_TOOLS_PIPE_PATH: this.options.pipePath }
    for (const key of Object.keys(env)) {
      if (key.startsWith('QQ_BOT_'))
        delete env[key]
    }
    const child = this.child = spawn(process.execPath, [this.options.server], { stdio: ['pipe', 'pipe', 'pipe'], shell: false, env })
    child.stderr.resume()
    child.on('error', () => this.fail(new Error('Desktop adapter could not start')))
    child.stdin.on('error', () => this.fail(new Error('Desktop adapter input closed')))
    child.on('exit', () => this.fail(new Error('Desktop adapter disconnected')))
    const lines = createInterface({ input: child.stdout })
    child.on('exit', () => lines.close())
    lines.on('line', (line) => {
      try {
        const message = JSON.parse(line)
        const pending = this.pending.get(message.id)
        if (!pending)
          return
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        if (message.error)
          pending.reject(new Error('Desktop host rejected the request'))
        else pending.resolve(message.result)
      }
      catch {
        this.fail(new Error('Invalid Desktop adapter response'))
        child.kill()
      }
    })
    try {
      await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'el-bot', version: '0.1.0' } })
      this.send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    }
    catch (error) {
      await this.close()
      throw error
    }
  }

  private send(message: unknown) {
    if (!this.child?.stdin.writable || this.child.killed)
      throw new Error('Desktop adapter is not connected')
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private request(method: string, params: unknown): Promise<any> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error('Desktop request timed out; result is uncertain'))
        this.child?.kill()
      }, this.options.requestTimeoutMs ?? 30000)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.send({ jsonrpc: '2.0', id, method, params })
      }
      catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  async listTools(): Promise<DesktopTool[]> {
    await this.start()
    const tools: DesktopTool[] = []
    const seen = new Set<string>()
    let cursor: string | undefined
    do {
      const result = await this.request('tools/list', cursor ? { cursor } : {})
      if (!Array.isArray(result?.tools) || tools.length + result.tools.length > 1000)
        throw new Error('Invalid Desktop tool catalog')
      for (const tool of result.tools) {
        if (typeof tool?.name !== 'string' || !tool.inputSchema || typeof tool.inputSchema !== 'object')
          throw new Error('Invalid Desktop tool definition')
        tools.push(tool)
      }
      cursor = result.nextCursor
      if (cursor && (typeof cursor !== 'string' || seen.has(cursor)))
        throw new Error('Invalid Desktop catalog cursor')
      if (cursor)
        seen.add(cursor)
    } while (cursor)
    this.tools = new Map(tools.map(tool => [tool.name, tool]))
    return tools
  }

  async tool(name: string): Promise<DesktopTool> {
    if (!this.tools.size)
      await this.listTools()
    const tool = this.tools.get(name)
    if (!tool)
      throw new Error('Desktop tool is unavailable on this host')
    return tool
  }

  async assert(name: string, args: Record<string, unknown>): Promise<void> {
    const tool = await this.tool(name)
    const validate = new Ajv({ strict: false, validateFormats: false }).compile(tool.inputSchema)
    if (!validate(args))
      throw new Error('Invalid Desktop tool arguments')
  }

  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.assert(name, args)
    const result = await this.request('tools/call', { name, arguments: args, _meta: { threadId: this.options.threadId } })
    if (result?.isError)
      throw new Error('Desktop tool failed; inspect the dedicated local chat')
    return result
  }

  private fail(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.emit('disconnect', error)
  }

  async close() {
    const child = this.child
    if (!child || child.exitCode !== null || child.signalCode !== null)
      return
    this.fail(new Error('Desktop adapter closed'))
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        resolve()
      }, 2000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
