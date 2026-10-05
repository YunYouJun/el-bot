import type { InstanceIdentity, RemoteState, TaskStatus } from './types'
import { constants } from 'node:fs'
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname } from 'node:path'
import process from 'node:process'
import { isRecord } from 'qq-sdk/official'
import { FAILURE_MESSAGES } from './constants'

/** Pin local state to its bot and environment before opening any remote connection. */
export function bindInstance(state: RemoteState, identity: InstanceIdentity): void {
  if (state.instance) {
    for (const key of ['appId', 'sandbox', 'profile', 'codexHome'] as const) {
      if (state.instance[key] !== identity[key])
        throw new Error('状态文件属于其他机器人、环境或 Codex 目录。请使用对应 profile / 凭据 / 状态；不会重置原绑定。')
    }
  }
  else {
    state.instance = { ...identity }
  }
}

export class StateStore {
  private writes = Promise.resolve()
  constructor(readonly filename: string) {}

  async lock() {
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    const path = `${this.filename}.lock`
    const file = await open(path, 'wx', 0o600).catch(() => {
      throw new Error(
        `State is locked: ${path}. Stop the existing process; remove a stale lock only after checking its PID.`,
      )
    })
    await file.writeFile(String(process.pid))
    await file.close()
    return async () => {
      await this.writes
      await unlink(path)
    }
  }

  async load(project: string): Promise<RemoteState> {
    let text: string
    try {
      text = await readFile(this.filename, 'utf8')
    }
    catch (error) {
      if (isRecord(error) && error.code === 'ENOENT')
        return { version: 1, project, threads: {}, tasks: [], seen: [] }
      throw error
    }
    let data: unknown
    try {
      data = JSON.parse(text)
    }
    catch {
      throw new Error('Invalid state JSON; restore a backup instead of resetting ownership')
    }
    if (
      !isRecord(data)
      || data.version !== 1
      || typeof data.project !== 'string'
      || (data.owner !== undefined && typeof data.owner !== 'string')
      || (data.instance !== undefined && (!isRecord(data.instance)
        || typeof data.instance.appId !== 'string' || !data.instance.appId
        || typeof data.instance.sandbox !== 'boolean'
        || (data.instance.profile !== undefined && typeof data.instance.profile !== 'string')
        || (data.instance.codexHome !== undefined && typeof data.instance.codexHome !== 'string')))
      || !isRecord(data.threads)
      || !Array.isArray(data.seen)
      || !data.seen.every(id => typeof id === 'string')
      || !Array.isArray(data.tasks)
    ) {
      throw new Error(
        'Invalid state file; restore a backup instead of silently resetting ownership',
      )
    }
    for (const thread of Object.values(data.threads)) {
      if (
        !isRecord(thread)
        || typeof thread.id !== 'string'
        || typeof thread.cwd !== 'string'
      ) {
        throw new Error('Invalid persisted thread')
      }
    }
    const statuses: TaskStatus[] = [
      'starting',
      'running',
      'completed',
      'interrupted',
      'failed',
    ]
    for (const task of data.tasks) {
      if (
        !isRecord(task)
        || typeof task.id !== 'string'
        || typeof task.project !== 'string'
        || typeof task.output !== 'string'
        || typeof task.createdAt !== 'string'
        || !statuses.includes(task.status as TaskStatus)
        || (task.threadId !== undefined && typeof task.threadId !== 'string')
        || (task.turnId !== undefined && typeof task.turnId !== 'string')
        || (task.failure !== undefined && (typeof task.failure !== 'string' || !Object.hasOwn(FAILURE_MESSAGES, task.failure)))
      ) {
        throw new Error('Invalid persisted task')
      }
      if (task.status === 'starting' || task.status === 'running') {
        task.status = 'interrupted'
        task.output
          += '\n上次进程已退出，任务未自动重放。请检查项目后继续会话。'
      }
    }
    await chmod(this.filename, 0o600)
    return data as unknown as RemoteState
  }

  /** Keep a one-time copy before adding identity metadata to an existing state file. */
  async backupLegacy(suffix = 'before-instance'): Promise<void> {
    try {
      await copyFile(this.filename, `${this.filename}.${suffix}.json`, constants.COPYFILE_EXCL)
      await chmod(`${this.filename}.${suffix}.json`, 0o600)
    }
    catch (error) {
      if (!['ENOENT', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw error
    }
  }

  save(state: RemoteState): Promise<void> {
    const snapshot = JSON.stringify(state, null, 2)
    const write = this.writes.then(async () => {
      const temporary = `${this.filename}.tmp`
      await writeFile(temporary, snapshot, { mode: 0o600 })
      await chmod(temporary, 0o600)
      await rename(temporary, this.filename)
    })
    this.writes = write.catch(() => {})
    return write
  }
}
