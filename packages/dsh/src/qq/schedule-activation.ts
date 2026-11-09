import type { QQManager } from './contracts'
import type { QQPolicy } from './policy'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Native schedules must revive QQ's transport binding, not only the host Agent. */
export function ownerScheduleResolver(
  manager: () => Pick<QQManager, 'getOrCreate'> | undefined,
  policy: Pick<QQPolicy, 'appId' | 'owner' | 'paused'>,
  preferences = join(homedir(), '.dsh-qqbot/model-prefs.json'),
) {
  return async (sessionId: string, next: () => Promise<unknown>): Promise<unknown> => {
    let bytes: string
    try {
      bytes = await readFile(preferences, 'utf8')
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return next()
      throw error
    }
    if (bytes.length > 256 * 1024)
      throw new Error('QQ model preferences exceed their size limit')
    const saved: { sessionIds?: Record<string, unknown> } = JSON.parse(bytes)
    if (saved.sessionIds?.[`qqbot:${policy.appId}:c2c:${policy.owner}`] !== sessionId)
      return next()
    if (policy.paused('c2c', policy.owner))
      throw new Error('Owner reminders are paused during manual control')
    const qq = manager()
    if (!qq)
      throw new Error('QQ reminder transport is not ready')
    const record = await qq.getOrCreate('c2c', policy.owner, policy.owner, { scope: 'c2c', targetId: policy.owner, msgId: '' })
    if (record.sessionId !== sessionId || record.scope !== 'c2c' || record.peerId !== policy.owner)
      throw new Error('QQ reminder session binding changed')
    return record.agent
  }
}
