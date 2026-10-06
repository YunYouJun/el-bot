import type { CodexReadinessClient, RemoteConfig, RemoteState, SessionCheck } from './types'
import { isRecord } from 'qq-sdk/official'
import { failureCode } from './failures'

/** Read stored metadata without resuming, unarchiving, or spending a model turn. */
export async function inspectSession(codex: CodexReadinessClient, project: string, cwd: string, saved?: { id: string, cwd: string }): Promise<SessionCheck> {
  if (!saved)
    return { project, status: 'new' }
  if (saved.cwd !== cwd)
    return { project, status: 'project-changed' }
  try {
    if (codex.inspectThread)
      return { project, status: await codex.inspectThread(saved.id, cwd) }
    const read = await codex.request('thread/read', { threadId: saved.id, includeTurns: false })
    if (!isRecord(read) || !isRecord(read.thread) || read.thread.id !== saved.id)
      return { project, status: 'unavailable' }
    if (read.thread.cwd !== cwd)
      return { project, status: 'project-changed' }
    // The archive filter is the protocol authority, not an inferred runtime status or path.
    const cursors = new Set<string>()
    let cursor: string | undefined
    do {
      const result = await codex.request('thread/list', { archived: true, cwd, limit: 100, ...(cursor ? { cursor } : {}) })
      if (!isRecord(result) || !Array.isArray(result.data))
        return { project, status: 'unavailable' }
      if (result.data.some(thread => isRecord(thread) && thread.id === saved.id))
        return { project, status: 'archived' }
      cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined
      if (cursor && (cursors.has(cursor) || cursors.size >= 20))
        return { project, status: 'unavailable' }
      if (cursor)
        cursors.add(cursor)
    } while (cursor)
    return { project, status: 'ready' }
  }
  catch (error) {
    const code = failureCode(error)
    return { project, status: code === 'session-archived' ? 'archived' : code === 'session-missing' ? 'missing' : 'unavailable' }
  }
}

export async function inspectSessions(codex: CodexReadinessClient, config: RemoteConfig, state: RemoteState): Promise<SessionCheck[]> {
  const results: SessionCheck[] = []
  for (const [project, cwd] of Object.entries(config.projects))
    results.push(await inspectSession(codex, project, cwd, state.threads[project]))
  return results
}

export function sessionSummary(check: SessionCheck): string {
  const labels: Record<SessionCheck['status'], string> = {
    'ready': '可继续',
    'new': '下一条任务新建会话',
    'archived': '已归档，不能继续；使用 /new 或本机 recover 创建新会话，历史保留',
    'missing': '会话不存在；核对本机程序的账户与目录，必要时使用 /new',
    'project-changed': '项目路径已变化；核对配置后使用 /new',
    'unavailable': '无法只读确认会话状态；检查本机程序连接、版本或会话列表能力',
  }
  return `${check.project}：${labels[check.status]}`
}
