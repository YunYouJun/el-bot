import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { MobileError } from './http'

export interface QQChatService {
  view: (sessionId: string, before?: number) => Promise<unknown>
  request: (sessionId: string, input: Record<string, unknown>) => Promise<unknown>
  member?: (sessionId: string, senderId: string) => Promise<unknown>
  sources: () => Record<string, string>
}
interface Grant { deviceId: string, sessionId: string, expiresAt: number }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Device-bound previews share DSH's existing handoff leases and durable send dedup. */
export class QQChatAdapter {
  private grants: Record<string, Grant> = Object.create(null)
  private saving: Promise<unknown> = Promise.resolve()
  constructor(private readonly path: string, private readonly service: () => QQChatService | undefined) {}

  async load() {
    try {
      const values = object(JSON.parse(await readFile(this.path, 'utf8')))
      for (const [id, value] of Object.entries(values)) {
        const grant = object(value)
        if (!/^[\w-]{1,128}$/.test(id) || typeof grant.deviceId !== 'string' || typeof grant.sessionId !== 'string' || typeof grant.expiresAt !== 'number')
          throw new Error('Invalid QQ preview grants')
        this.grants[id] = { deviceId: grant.deviceId, sessionId: grant.sessionId, expiresAt: grant.expiresAt }
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
  }

  private host() {
    const service = this.service()
    if (!service)
      throw new MobileError(503, 'qq_chat_unavailable')
    return service
  }

  async view(sessionId: string, before?: number) {
    try {
      return await this.host().view(sessionId, before)
    }
    catch (error) { throw failure(error) }
  }

  async member(sessionId: string, senderId: string) {
    try {
      const service = this.host()
      if (!service.member)
        throw new MobileError(503, 'qq_chat_unavailable')
      return await service.member(sessionId, senderId)
    }
    catch (error) { throw failure(error) }
  }

  async request(deviceId: string, sessionId: string, input: Record<string, unknown>) {
    const service = this.host()
    const operation = input.operation
    if (!['begin', 'end', 'preview', 'send'].includes(String(operation)))
      throw new MobileError(400, 'invalid_request')
    if (operation === 'send') {
      const grant = typeof input.preview === 'string' ? this.grants[input.preview] : undefined
      if (!grant || grant.deviceId !== deviceId || grant.sessionId !== sessionId)
        throw new MobileError(409, 'preview_expired')
    }
    try {
      const result = await service.request(sessionId, input)
      if (operation === 'preview') {
        const preview = object(result)
        if (typeof preview.id !== 'string' || typeof preview.expiresAt !== 'number')
          throw new MobileError(503, 'invalid_qq_response')
        this.grants[preview.id] = { deviceId, sessionId, expiresAt: preview.expiresAt }
        await this.save()
        return { preview: result }
      }
      if (operation === 'send')
        return { delivery: result }
      return { state: await service.view(sessionId) }
    }
    catch (error) { throw failure(error) }
  }

  async close() { await this.saving }
  private save() {
    this.grants = Object.fromEntries(Object.entries(this.grants).filter(([, value]) => value.expiresAt > Date.now() - 86_400_000))
    if (Object.keys(this.grants).length > 2000)
      throw new MobileError(429, 'confirmation_limit')
    const json = `${JSON.stringify(this.grants)}\n`
    const task = this.saving.catch(() => {}).then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      await writeFile(`${this.path}.tmp`, json, { mode: 0o600 })
      await rename(`${this.path}.tmp`, this.path)
    })
    this.saving = task
    return task
  }
}
function failure(error: unknown) {
  if (error instanceof MobileError)
    return error
  const value = object(error)
  return new MobileError(typeof value.status === 'number' ? value.status : 503, typeof value.code === 'string' ? value.code : 'qq_chat_unavailable')
}
