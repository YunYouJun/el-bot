import type { ToolRuntime } from './contracts'
import type { GroupCandidate, QQGroupDirectory } from './groups'
import type { QQMemberImpressions } from './impressions'
import type { QQSecurity } from './policy'
import type { QQTranscript } from './transcript'
import { impressionText } from './impressions'

type Operation = 'list' | 'get' | 'set' | 'clear'
const OPERATIONS: Operation[] = ['list', 'get', 'set', 'clear']
const SENDER = /^[\w-]{1,128}$/

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Arguments must be an object')
  return value as Record<string, unknown>
}

function text(value: unknown, field: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`${field} must be a non-empty string of at most ${max} characters`)
  return value.trim()
}

/** Owner-private memory about group members. The group chat itself remains tool-free. */
export class QQMemberImpressionTool {
  constructor(
    private readonly impressions: QQMemberImpressions,
    private readonly transcript: QQTranscript,
    private readonly groups: QQGroupDirectory,
    private readonly policy: QQSecurity,
  ) {}

  register(tools: ToolRuntime) {
    if (!tools.register)
      return () => {}
    return tools.register({
      name: 'qq_group_member_impression',
      description: 'Read, save or clear Xiaoyun\'s short impression of a QQ group member. Only the authenticated owner private chat may use this; group chats are chat-only. Use this when the owner asks you to remember, review or forget an impression. Keep it brief and kind, and never store secrets, credentials, private contact details or sensitive inferences.',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: OPERATIONS, description: 'list saved impressions, get one, set/update one, or clear one' },
          group: { type: 'string', description: 'Group name or group OpenID from the group information page' },
          member: { type: 'string', description: 'Member nickname or sender OpenID from the member details page' },
          impression: { type: 'string', description: 'A short impression of 1-280 characters, for set only' },
        },
        required: ['operation'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { operation: { type: 'string' } },
          required: ['operation'],
          additionalProperties: true,
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: (args, execution) => this.execute(execution.agent, args),
    })
  }

  async execute(agent: object | undefined, args: unknown) {
    if (!this.policy.isOwnerDirect(agent))
      throw new Error('Only the authenticated QQ owner private chat may manage member impressions. Group chats are chat-only.')
    const value = object(args)
    if (Object.keys(value).some(key => !['operation', 'group', 'member', 'impression'].includes(key)))
      throw new Error('Unknown impression arguments')
    if (!OPERATIONS.includes(value.operation as Operation))
      throw new Error('operation must be list, get, set or clear')
    const operation = value.operation as Operation
    if (operation === 'list')
      return this.list()
    const group = this.group(text(value.group, 'group', 160))
    const member = await this.member(group, text(value.member, 'member', 160))
    if (operation === 'get')
      return { operation, group, member, impression: this.impressions.get(member.id) ?? null }
    if (operation === 'clear')
      return { operation, group, member, cleared: await this.impressions.clear(member.id) }
    const impression = await this.impressions.set(group.id, member.id, impressionText(value.impression), {
      groupName: group.name,
      senderName: member.name,
    })
    return { operation, group, member, impression }
  }

  private list() {
    const groups = new Map(this.groups.candidates().map(group => [group.id, group]))
    const grouped = new Map<string, { id: string, name?: string, members: { senderId: string, impression: { text: string, updatedAt: string } }[] }>()
    for (const entry of this.impressions.list()) {
      const group = groups.get(entry.groupId)
      if (!group)
        continue
      const name = group.name ?? entry.groupName
      const row = grouped.get(entry.groupId) ?? { id: group.id, ...(name ? { name } : {}), members: [] }
      if (row.members.length < 20) {
        row.members.push({
          senderId: entry.senderId,
          ...(entry.senderName ? { senderName: entry.senderName } : {}),
          impression: { text: entry.text, updatedAt: entry.updatedAt },
        })
      }
      grouped.set(entry.groupId, row)
    }
    const rows = [...grouped.values()]
    return { operation: 'list', groups: rows.slice(0, 30), truncated: rows.length > 30 }
  }

  private group(query: string): GroupCandidate {
    const candidates = this.groups.candidates()
    const exactId = candidates.find(group => group.id === query)
    if (exactId)
      return exactId
    const normalized = query.toLocaleLowerCase()
    const exact = candidates.filter(group => group.name?.toLocaleLowerCase() === normalized)
    if (exact.length === 1)
      return exact[0]
    if (exact.length > 1)
      throw new Error(`Group name is ambiguous: ${exact.map(group => `${group.name} (${group.id})`).join(', ')}`)
    const partial = candidates.filter(group => group.name?.toLocaleLowerCase().includes(normalized))
    if (partial.length === 1)
      return partial[0]
    const names = candidates.slice(0, 10).map(group => group.name ? `${group.name} (${group.id})` : group.id)
    throw new Error(`Group "${query}" was not found. Available groups: ${names.join(', ') || 'none'}`)
  }

  private async member(group: GroupCandidate, query: string) {
    const members = await this.transcript.members(group.id, 500)
    const normalized = query.toLocaleLowerCase()
    const exact = members.filter(member => member.senderName?.toLocaleLowerCase() === normalized)
    if (exact.length === 1)
      return { id: exact[0].senderId, ...(exact[0].senderName ? { name: exact[0].senderName } : {}) }
    if (exact.length > 1)
      throw new Error(`Member name is ambiguous: ${exact.map(member => `${member.senderName} (${member.senderId})`).join(', ')}`)
    const partial = members.filter(member => member.senderName?.toLocaleLowerCase().includes(normalized))
    if (partial.length === 1)
      return { id: partial[0].senderId, ...(partial[0].senderName ? { name: partial[0].senderName } : {}) }
    if (query.length >= 16 && SENDER.test(query))
      return { id: query }
    const names = members.slice(0, 10).map(member => member.senderName ? `${member.senderName} (${member.senderId})` : member.senderId)
    throw new Error(`Member "${query}" was not found. Recent members: ${names.join(', ') || 'none'}. Use the sender OpenID from the member details page when the nickname is ambiguous.`)
  }
}
