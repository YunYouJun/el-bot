import type { QQContext } from './contracts'
import { existsSync } from 'node:fs'
import { chmod, lstat, unlink } from 'node:fs/promises'
import { createServer } from 'node:net'

export const DEPLOY_HOLD = '/run/el-bot-dsh-deploy/hold'
const LEASE_MS = 90_000

export interface DeploymentJobs {
  list: (owner?: string) => { status: string }[]
}

/** Admission fence for the short, local deployment handoff. Existing turns are never cancelled. */
export class QQDeployment {
  private lease = 0
  private inbound = 0
  private checking = false

  constructor(
    private readonly sessions: QQContext['sessionController'],
    private readonly otherWork: () => boolean,
    private readonly held = () => existsSync(DEPLOY_HOLD),
    private readonly now = Date.now,
    private readonly jobs?: () => DeploymentJobs | undefined,
  ) {}

  get frozen() { return this.lease > this.now() || this.held() }
  get paused() { return this.checking || this.frozen }

  async admit(operation: () => Promise<void>, rejected: () => void) {
    if (this.paused) {
      rejected()
      return
    }
    this.inbound++
    try {
      await operation()
    }
    finally { this.inbound-- }
  }

  async command(command: string) {
    if (command === 'status')
      return { state: 'ready', paused: this.paused }
    if (command === 'release') {
      this.lease = 0
      return { state: 'released' }
    }
    if (command !== 'prepare' || this.checking)
      return { state: 'unavailable' }
    this.checking = true
    try {
      const active = () => this.inbound > 0 || this.otherWork()
      if (active())
        return { state: 'busy' }
      const signal = AbortSignal.timeout(5000)
      const result = await this.sessions.list({}, signal)
      if (!Array.isArray(result.items))
        return { state: 'unavailable' }
      if (typeof result.total === 'number' && result.total > result.items.length)
        return { state: 'unavailable' }
      if (active() || result.items.some(item => item.running === true))
        return { state: 'busy' }
      const jobs = this.jobs?.()
      const jobActive = (owner?: string) => jobs?.list(owner).some(job => ['running', 'stopping'].includes(job.status))
      // Jobs can outlive their owner's model turn. The DSH registry scopes listings to an owner.
      if (jobActive() || result.items.some(item => jobActive(item.sessionId)))
        return { state: 'busy' }
      this.lease = this.now() + LEASE_MS
      return { state: 'prepared' }
    }
    catch { return { state: 'unavailable' } }
    finally { this.checking = false }
  }
}

export async function serveQQDeployment(path: string, gate: QQDeployment) {
  try {
    if (!(await lstat(path)).isSocket())
      throw new Error('Deployment path already exists and is not a socket')
    await unlink(path)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }
  const server = createServer((socket) => {
    socket.setTimeout(8000, () => socket.destroy())
    socket.on('error', () => {})
    let data = ''
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8')
      if (data.length > 24) {
        socket.destroy()
        return
      }
      if (data.endsWith('\n')) {
        const command = data.trim()
        socket.removeAllListeners('data')
        void gate.command(command).then(result => socket.end(`${JSON.stringify(result)}\n`))
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, resolve)
  })
  await chmod(path, 0o600)
  return () => {
    server.close()
  }
}
