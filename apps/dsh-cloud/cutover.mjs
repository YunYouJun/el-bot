import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

export const name = 'el-bot-cloud-cutover'
export const inject = ['qqWorkspaceGrouping']

// A one-time native fork moves the cloud receiver to its selected model without
// rewriting seeded request events or replacing the local desktop's preferences.
export async function apply(ctx, route) {
  const marker = join(homedir(), '.dsh-qqbot/cloud-cutover.json')
  try {
    if (JSON.parse(await readFile(marker, 'utf8')).completed)
      return
  }
  catch (error) {
    if (error.code !== 'ENOENT')
      throw error
  }
  const grouping = ctx.get('qqWorkspaceGrouping')
  for (let i = 0; i < 300; i++) {
    if (grouping.manager && grouping.queues.size === 0) {
      const status = JSON.parse(await readFile(join(homedir(), '.dsh-qqbot/workspace-grouping-status.json'), 'utf8'))
      if (status.phase === 'ready')
        break
    }
    if (i === 299)
      throw new Error('QQ workspace initialization did not settle')
    await setTimeout(100)
  }
  const manager = grouping.manager
  const prefs = JSON.parse(await readFile(join(homedir(), '.dsh-qqbot/model-prefs.json'), 'utf8'))
  const branches = []
  for (const key of Object.keys(prefs.sessionIds)) {
    const prefix = `qqbot:${manager.config.appId}:`
    if (!key.startsWith(prefix))
      continue
    const rest = key.slice(prefix.length)
    const colon = rest.indexOf(':')
    const scope = rest.slice(0, colon)
    const peerId = rest.slice(colon + 1)
    if (!['c2c', 'group'].includes(scope))
      continue
    const access = manager.config.access
    const mode = scope === 'c2c' ? access.c2cMode : access.groupMode
    const allow = scope === 'c2c' ? access.c2cAllow : access.groupAllow
    if (mode === 'disabled' || (mode === 'allowlist' && !allow?.includes(peerId)))
      continue
    const sender = scope === 'c2c' ? peerId : manager.config.access.c2cAllow[0]
    const record = await manager.getOrCreate(scope, peerId, sender, { scope, targetId: peerId, msgId: '' })
    const before = manager.host.sessionEvents(record.agent.session)
    const original = JSON.stringify(before)
    const previousId = record.sessionId
    await manager.setModelOverride(scope, peerId, route)
    const events = manager.host.sessionEvents(record.agent.session)
    const workspace = grouping.workspaces[scope]
    if (JSON.stringify(events.slice(0, before.length)) !== original || !workspace.sessionIds.includes(record.sessionId))
      throw new Error('Cloud cutover failed history or workspace verification')
    branches.push({ scope, from: previousId, to: record.sessionId, historyPreserved: true, workspace: workspace.title })
  }
  await writeFile(marker, `${JSON.stringify({ completed: true, route, branches, completedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 })
}
