import { Buffer } from 'node:buffer'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface MemberImpression {
  text: string
  updatedAt: string
  senderName?: string
}

export interface MemberImpressionEntry extends MemberImpression {
  groupId: string
  senderId: string
  groupName?: string
}

interface Document {
  version: 3
  members: Record<string, MemberImpression>
  groups: Record<string, string[]>
  groupNames: Record<string, string>
}

const GROUP = /^[\w-]{1,128}$/
const MAX_TEXT = 280
const MAX_GROUPS = 1024
const MAX_MEMBERS_PER_GROUP = 500
const MAX_ENTRIES = 5000
const MAX_FILE = 4 * 1024 * 1024
const MAX_JSON = 3 * 1024 * 1024

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function label(value: unknown) {
  if (typeof value !== 'string')
    return
  const text = value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 160) : undefined
}

export function impressionText(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('Impression text is required')
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text || text.length > MAX_TEXT)
    throw new Error(`Impression text must be 1-${MAX_TEXT} characters`)
  return text
}

function record(value: unknown): MemberImpression | undefined {
  if (!object(value) || typeof value.text !== 'string' || typeof value.updatedAt !== 'string')
    return
  const text = value.text.trim()
  if (!text || text.length > MAX_TEXT || !Number.isFinite(Date.parse(value.updatedAt)))
    return
  const senderName = label(value.senderName)
  return {
    text,
    updatedAt: new Date(value.updatedAt).toISOString(),
    ...(senderName ? { senderName } : {}),
  }
}

function escapeText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeCell(value: string) {
  return escapeText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\r?\n/g, ' ')
}

/** Short, owner-authored impressions survive transcript rotation and history cleanup. */
export class QQMemberImpressions {
  private document: Document = {
    version: 3,
    members: Object.create(null),
    groups: Object.create(null),
    groupNames: Object.create(null),
  }

  private saving: Promise<unknown> = Promise.resolve()
  private readonly markdownPath: string

  constructor(private readonly path: string, private readonly now = Date.now) {
    this.markdownPath = path.endsWith('.json') ? `${path.slice(0, -5)}.md` : `${path}.md`
  }

  async load() {
    let mirror = true
    try {
      if ((await stat(this.path)).size > MAX_FILE)
        throw new Error('Oversized QQ member impressions')
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (!object(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3) || !object(value.groups))
        throw new Error('Invalid QQ member impressions')
      const members: Record<string, MemberImpression> = Object.create(null)
      const groups: Record<string, string[]> = Object.create(null)
      const groupNames: Record<string, string> = Object.create(null)
      if (value.version === 3) {
        if (!object(value.members))
          throw new Error('Invalid QQ member impressions')
        for (const [senderId, entry] of Object.entries(value.members).slice(0, MAX_ENTRIES * 2)) {
          const impression = record(entry)
          if (GROUP.test(senderId) && impression)
            members[senderId] = impression
        }
        for (const [groupId, senderIds] of Object.entries(value.groups).slice(0, MAX_GROUPS)) {
          if (!GROUP.test(groupId) || !Array.isArray(senderIds))
            continue
          const linked = [...new Set(senderIds.filter(senderId => typeof senderId === 'string'))]
            .filter(senderId => Boolean(members[senderId]))
            .slice(0, MAX_MEMBERS_PER_GROUP)
          if (!linked.length)
            continue
          groups[groupId] = linked
          const groupName = object(value.groupNames) ? label(value.groupNames[groupId]) : undefined
          if (groupName)
            groupNames[groupId] = groupName
        }
      }
      else {
        for (const [groupId, rows] of Object.entries(value.groups).slice(0, MAX_GROUPS)) {
          if (!GROUP.test(groupId) || !object(rows))
            continue
          const linked: string[] = []
          for (const [senderId, entry] of Object.entries(rows).slice(0, MAX_MEMBERS_PER_GROUP)) {
            const impression = record(entry)
            if (!GROUP.test(senderId) || !impression)
              continue
            const previous = members[senderId]
            if (!previous || previous.updatedAt < impression.updatedAt || (previous.updatedAt === impression.updatedAt && !previous.senderName))
              members[senderId] = impression
            linked.push(senderId)
          }
          if (!linked.length)
            continue
          groups[groupId] = [...new Set(linked)]
          const groupName = object(value.groupNames) ? label(value.groupNames[groupId]) : undefined
          if (groupName)
            groupNames[groupId] = groupName
        }
      }
      const retained: Record<string, MemberImpression> = Object.create(null)
      for (const [senderId, impression] of Object.entries(members)
        .sort(([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, MAX_ENTRIES)) {
        retained[senderId] = impression
      }
      const retainedGroups: Record<string, string[]> = Object.create(null)
      const retainedNames: Record<string, string> = Object.create(null)
      for (const [groupId, senderIds] of Object.entries(groups)) {
        const linked = senderIds.filter(senderId => Boolean(retained[senderId]))
        if (!linked.length)
          continue
        retainedGroups[groupId] = linked
        if (groupNames[groupId])
          retainedNames[groupId] = groupNames[groupId]
      }
      this.document = { version: 3, members: retained, groups: retainedGroups, groupNames: retainedNames }
    }
    catch (error) {
      // Optional display memory must never prevent QQ chat from starting.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.error('QQ member impressions are unavailable', error instanceof Error ? error.message : 'unknown')
      mirror = (error as NodeJS.ErrnoException).code === 'ENOENT'
      this.document = {
        version: 3,
        members: Object.create(null),
        groups: Object.create(null),
        groupNames: Object.create(null),
      }
    }
    if (mirror)
      await this.writeMirror().catch(() => {})
  }

  get(senderId: string): MemberImpression | undefined {
    if (!GROUP.test(senderId))
      return
    const value = this.document.members[senderId]
    return value ? { ...value } : undefined
  }

  list(groupId?: string): MemberImpressionEntry[] {
    const groups = groupId === undefined
      ? Object.entries(this.document.groups)
      : GROUP.test(groupId) && this.document.groups[groupId]
        ? [[groupId, this.document.groups[groupId]] as const]
        : []
    return groups.flatMap(([id, senderIds]) => senderIds.flatMap((senderId) => {
      const value = this.document.members[senderId]
      return value
        ? [{
            groupId: id,
            senderId,
            ...(this.document.groupNames[id] ? { groupName: this.document.groupNames[id] } : {}),
            ...value,
          }]
        : []
    }))
  }

  async set(
    groupId: string,
    senderId: string,
    value: unknown,
    labels?: { groupName?: string, senderName?: string },
  ) {
    if (!GROUP.test(groupId) || !GROUP.test(senderId))
      throw new Error('Invalid QQ member identity')
    const text = impressionText(value)
    const groups = this.document.groups
    const members = this.document.members
    if (!groups[groupId] && Object.keys(groups).length >= MAX_GROUPS)
      throw new Error('QQ member impression group limit reached')
    if (!members[senderId] && Object.keys(members).length >= MAX_ENTRIES) {
      const oldest = Object.entries(members).sort(([, left], [, right]) => left.updatedAt.localeCompare(right.updatedAt))[0]
      if (oldest)
        this.remove(oldest[0])
    }
    const linked = groups[groupId] ?? []
    if (!linked.includes(senderId) && linked.length >= MAX_MEMBERS_PER_GROUP)
      throw new Error('QQ member impression member limit reached')
    const previous = members[senderId]
    const senderName = label(labels?.senderName) ?? previous?.senderName
    const saved: MemberImpression = {
      text,
      updatedAt: new Date(this.now()).toISOString(),
      ...(senderName ? { senderName } : {}),
    }
    members[senderId] = saved
    if (!groups[groupId])
      groups[groupId] = []
    if (!groups[groupId]!.includes(senderId))
      groups[groupId]!.push(senderId)
    const groupName = label(labels?.groupName) ?? this.document.groupNames[groupId]
    if (groupName)
      this.document.groupNames[groupId] = groupName
    this.compact()
    await this.save()
    return { ...saved }
  }

  async clear(senderId: string) {
    if (!GROUP.test(senderId))
      return false
    if (!this.remove(senderId))
      return false
    await this.save()
    return true
  }

  async close() {
    await this.saving
  }

  private remove(senderId: string) {
    if (!this.document.members[senderId])
      return false
    delete this.document.members[senderId]
    for (const [groupId, senderIds] of Object.entries(this.document.groups)) {
      const linked = senderIds.filter(id => id !== senderId)
      if (linked.length) {
        this.document.groups[groupId] = linked
      }
      else {
        delete this.document.groups[groupId]
        delete this.document.groupNames[groupId]
      }
    }
    return true
  }

  private compact() {
    let count = Object.keys(this.document.members).length
    if (count <= 1 || Buffer.byteLength(JSON.stringify(this.document)) <= MAX_JSON)
      return
    const oldest = Object.entries(this.document.members).sort(([, left], [, right]) => left.updatedAt.localeCompare(right.updatedAt))
    for (const [senderId] of oldest) {
      if (count <= 1 || Buffer.byteLength(JSON.stringify(this.document)) <= MAX_JSON)
        break
      if (this.remove(senderId))
        count -= 1
    }
  }

  private markdown() {
    const entries = this.list()
    const generatedAt = new Date(this.now()).toISOString()
    const lines = [
      '# 小云对群成员的印象',
      '',
      '> 由 `member-impressions.json` 自动生成。请通过小云或管理工具修改；直接编辑本文件不会回写。',
      `> 共 ${entries.length} 条群内关联，覆盖 ${new Set(entries.map(entry => entry.senderId)).size} 名成员，生成于 ${generatedAt}。`,
      '',
    ]
    if (!entries.length) {
      lines.push('_暂无印象。_', '')
      return lines.join('\n')
    }
    const groups = new Map<string, MemberImpressionEntry[]>()
    for (const entry of entries) {
      const rows = groups.get(entry.groupId) ?? []
      rows.push(entry)
      groups.set(entry.groupId, rows)
    }
    const ordered = [...groups.entries()].sort(([leftId, left], [rightId, right]) => {
      const leftName = left[0].groupName ?? leftId
      const rightName = right[0].groupName ?? rightId
      return leftName.localeCompare(rightName, 'zh-Hans') || leftId.localeCompare(rightId)
    })
    for (const [groupId, rows] of ordered) {
      const groupName = rows[0].groupName ?? groupId
      lines.push(`## ${escapeText(groupName)}`, '')
      if (groupName !== groupId)
        lines.push(`群 OpenID：\`${groupId}\``, '')
      lines.push('| 成员 | 发送者 OpenID | 印象 | 更新时间 (UTC) |', '| --- | --- | --- | --- |')
      for (const entry of rows.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
        lines.push(`| ${escapeCell(entry.senderName ?? '（未记录昵称）')} | \`${entry.senderId}\` | ${escapeCell(entry.text)} | ${entry.updatedAt} |`)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  private save() {
    const json = `${JSON.stringify(this.document)}\n`
    const task = this.saving.catch(() => {}).then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      await writeFile(`${this.path}.tmp`, json, { mode: 0o600 })
      await rename(`${this.path}.tmp`, this.path)
      try {
        await this.writeMirror()
      }
      catch (error) {
        console.error('QQ member impression mirror is unavailable', error instanceof Error ? error.message : 'unknown')
      }
    })
    this.saving = task
    return task
  }

  private async writeMirror() {
    await mkdir(dirname(this.markdownPath), { recursive: true, mode: 0o700 })
    await writeFile(`${this.markdownPath}.tmp`, `${this.markdown()}\n`, { mode: 0o600 })
    await rename(`${this.markdownPath}.tmp`, this.markdownPath)
  }
}
