import type { Socket } from 'node:net'
import type { RuntimeStatus } from './control-types'
import type { CliPaths } from './types'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmod, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { stripVTControlCharacters } from 'node:util'

export type { RuntimeStatus } from './control-types'

export type ControlOperation = 'status' | 'stop'
interface Descriptor { version: 1, pid: number, token: string, endpoint: string, instance: string }
interface ControlReply { ok: boolean, status?: RuntimeStatus, error?: string }
class ControlRejected extends Error {}
export const stoppedStatus: RuntimeStatus = { phase: 'stopped', qq: 'disconnected', codex: 'disconnected', busy: false }

function endpointFor(statePath: string) {
  const hash = createHash('sha256').update(resolve(statePath)).digest('hex').slice(0, 24)
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\el-bot-${hash}`
    : resolve(tmpdir(), `el-bot-${process.getuid?.() ?? 'user'}`, `${hash}.sock`)
}

async function privateFile(path: string) {
  const stat = await lstat(path)
  if (!stat.isFile() || (process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o077))))
    throw new Error('控制文件的所有者或权限不安全；请检查本机文件权限。')
  if (stat.size > 4096)
    throw new Error('控制文件过大。')
  return readFile(path, 'utf8')
}

async function readDescriptor(statePath: string): Promise<Descriptor> {
  const data: Descriptor = JSON.parse(await privateFile(`${statePath}.control.json`))
  if (data.version !== 1 || !Number.isSafeInteger(data.pid) || data.pid <= 0
    || typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)
    || typeof data.instance !== 'string' || !/^[a-f0-9]{32}$/.test(data.instance)
    || data.endpoint !== endpointFor(statePath)) {
    throw new Error('本机控制信息无效。')
  }
  return data
}

/** Private, authenticated IPC. The descriptor is published only while holding the state lock. */
export async function serveControl(
  statePath: string,
  status: () => RuntimeStatus,
  stop: (interrupt: boolean) => Promise<void>,
) {
  const endpoint = endpointFor(statePath)
  const descriptor: Descriptor = { version: 1, pid: process.pid, token: randomBytes(32).toString('hex'), instance: randomBytes(16).toString('hex'), endpoint }
  if (process.platform !== 'win32') {
    const directory = dirname(endpoint)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077))
      throw new Error('控制通道目录不安全。')
    await unlink(endpoint).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT')
        throw error
    })
  }
  const sockets = new Set<Socket>()
  const stoppingSockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => {
      sockets.delete(socket)
      stoppingSockets.delete(socket)
    })
    socket.setTimeout(65000, () => socket.destroy())
    let text = ''
    let handled = false
    socket.on('error', () => {})
    socket.on('data', (chunk) => {
      if (handled)
        return
      text += chunk.toString('utf8')
      if (Buffer.byteLength(text) > 4096) {
        socket.destroy()
        return
      }
      if (!text.includes('\n'))
        return
      handled = true
      void (async () => {
        let reply: ControlReply
        try {
          const request = JSON.parse(text.split('\n')[0])
          if (request.version !== 1 || request.instance !== descriptor.instance
            || typeof request.token !== 'string' || request.token.length !== descriptor.token.length
            || !timingSafeEqual(Buffer.from(request.token), Buffer.from(descriptor.token))) {
            throw new Error('控制请求身份校验失败。')
          }
          if (request.operation === 'stop') {
            if (typeof request.interrupt !== 'boolean')
              throw new Error('无效的中断参数。')
            stoppingSockets.add(socket)
            await stop(request.interrupt)
            reply = { ok: true, status: stoppedStatus }
          }
          else if (request.operation === 'status') {
            reply = {
              ok: true,
              status: status(),
            }
          }
          else {
            throw new Error('未知控制操作。')
          }
        }
        catch (error) {
          reply = {
            ok: false,
            error: error instanceof Error ? error.message : '本机控制失败。',
          }
        }
        socket.end(`${JSON.stringify(reply)}\n`)
      })()
    })
  })
  await new Promise<void>((done, reject) => {
    server.once('error', reject)
    server.listen(endpoint, () => {
      server.off('error', reject)
      done()
    })
  })
  server.on('error', () => {})
  try {
    if (process.platform !== 'win32')
      await chmod(endpoint, 0o600)
    const temporary = `${statePath}.control-${descriptor.instance}.tmp`
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(descriptor))
    }
    finally { await file.close() }
    await rename(temporary, `${statePath}.control.json`)
  }
  catch (error) {
    server.close()
    throw error
  }
  return async () => {
    // Do not await active sockets: a stop request is waiting for this cleanup to finish.
    server.close()
    for (const socket of sockets) {
      if (!stoppingSockets.has(socket))
        socket.destroy()
    }
    await unlink(`${statePath}.control.json`)
    if (process.platform !== 'win32') {
      await unlink(endpoint).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT')
          throw error
      })
    }
  }
}

async function request(statePath: string, operation: ControlOperation, interrupt = false): Promise<RuntimeStatus> {
  const descriptor = await readDescriptor(statePath)
  if ((await readFile(`${statePath}.lock`, 'utf8')).trim() !== String(descriptor.pid))
    throw new Error('状态锁与控制实例不匹配。')
  return new Promise((done, reject) => {
    const socket = connect(descriptor.endpoint)
    let output = ''
    socket.setTimeout(operation === 'stop' ? 60000 : 2500, () => socket.destroy(new Error('本机控制超时；请查看日志，不会强杀进程或删除状态锁。')))
    socket.once('error', reject)
    socket.on('connect', () => socket.write(`${JSON.stringify({ ...descriptor, operation, interrupt })}\n`))
    socket.on('data', (chunk) => {
      output += chunk.toString('utf8')
      if (output.length > 32768)
        socket.destroy(new Error('控制响应过大。'))
    })
    socket.once('end', () => {
      try {
        const reply: ControlReply = JSON.parse(output)
        if (!reply.ok || !reply.status)
          throw new ControlRejected(reply.error ?? '无效的控制响应。')
        done(reply.status)
      }
      catch (error) {
        reject(error)
      }
    })
    socket.once('close', () => {
      if (!output)
        reject(new Error('本机控制通道已关闭。'))
    })
  })
}

export async function runtimeStatus(statePath: string): Promise<RuntimeStatus> {
  try {
    await lstat(`${statePath}.lock`)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { ...stoppedStatus }
    throw error
  }
  try {
    return await request(statePath, 'status')
  }
  catch {
    return { ...stoppedStatus, phase: 'unmanaged', message: '发现状态锁，但无法验证控制通道。请在原终端退出旧服务；异常残留锁需人工核验，客户端不会发送终止信号。' }
  }
}

export async function stopBackground(statePath: string, interrupt = false) {
  const status = await runtimeStatus(statePath)
  if (status.phase === 'stopped')
    return status
  try {
    if (status.phase === 'unmanaged')
      throw new Error(status.message)
    return await request(statePath, 'stop', interrupt)
  }
  catch (error) {
    if (error instanceof ControlRejected)
      throw error
    // Another client may have completed cleanup between our status and stop RPC.
    for (let attempt = 0; attempt < 5; attempt++) {
      if ((await runtimeStatus(statePath)).phase === 'stopped')
        return { ...stoppedStatus }
      await delay(50)
    }
    throw error
  }
}

/** Use the same installed CLI and runtime; credential values never enter argv. */
export async function startBackground(paths: CliPaths, launcher?: { executable: string, args: string[] }): Promise<RuntimeStatus> {
  let existing = await runtimeStatus(paths.state)
  // A concurrent starter may hold the state lock just before publishing its endpoint.
  for (let attempt = 0; existing.phase === 'unmanaged' && attempt < 10; attempt++) {
    await delay(100)
    existing = await runtimeStatus(paths.state)
  }
  if (existing.phase === 'unmanaged')
    throw new Error(existing.message)
  if (existing.phase !== 'stopped')
    return existing
  await mkdir(dirname(paths.state), { recursive: true, mode: 0o700 })
  const log = await open(`${paths.state}.log`, 'a', 0o600)
  let child
  try {
    await log.chmod(0o600)
    const args = [...(launcher?.args ?? [...process.execArgv, process.argv[1], 'codex']), 'start', '--config', paths.config, '--credentials', paths.envFile, '--state', paths.state]
    // The legacy source launcher has no `codex` prefix.
    if (!launcher && /[/\\]qq-codex[/\\]src[/\\]index\.ts$/.test(process.argv[1]))
      args.splice(process.execArgv.length + 1, 1)
    if (paths.profile)
      args.push('--profile', paths.profile)
    child = spawn(launcher?.executable ?? process.execPath, args, { detached: true, stdio: ['ignore', log.fd, log.fd], windowsHide: true })
    child.unref()
  }
  finally { await log.close() }
  let failure: Error | undefined
  child.once('error', (error) => {
    failure = error
  })
  for (let i = 0; i < 150; i++) {
    const status = await runtimeStatus(paths.state)
    if (['starting', 'running', 'stopping'].includes(status.phase))
      return status
    if ((failure || child.exitCode !== null) && status.phase === 'stopped')
      throw new Error('后台启动失败；请查看本机日志。')
    await delay(100)
  }
  throw new Error('启动尚未完成；请查看状态和本机日志。不会强杀进程。')
}

export async function runtimeLogs(statePath: string) {
  let file
  try {
    file = await open(`${statePath}.log`, 'r')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { text: '', path: `${statePath}.log` }
    throw error
  }
  try {
    const stat = await file.stat()
    const start = Math.max(0, stat.size - 32000)
    const bytes = Buffer.alloc(stat.size - start)
    await file.read(bytes, 0, bytes.length, start)
    return { text: stripVTControlCharacters(bytes.toString('utf8')), path: `${statePath}.log` }
  }
  finally { await file.close() }
}
