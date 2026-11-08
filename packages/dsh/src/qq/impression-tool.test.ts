import type { QQGroupDirectory } from './groups'
import type { QQPolicy } from './policy'
import type { QQTranscript } from './transcript'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { QQMemberImpressionTool } from './impression-tool'
import { QQMemberImpressions } from './impressions'

it('shares member impressions across groups while keeping member identity isolation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-impression-tool-'))
  try {
    const impressions = new QQMemberImpressions(join(directory, 'impressions.json'))
    await impressions.load()
    const shared = { senderId: 'sender-1234567890ab', senderName: '薯条', senderRole: 'member', lastMessageAt: '2026-11-07T00:00:00.000Z', messageCount: 3 }
    const other = { senderId: 'sender-abcdef123456', senderName: '可乐', senderRole: 'member', lastMessageAt: '2026-11-07T00:30:00.000Z', messageCount: 1 }
    const transcript = {
      members: async (groupId: string) => groupId === 'group-b' ? [shared, other] : [shared],
    } as unknown as QQTranscript
    const groups = {
      candidates: () => [
        { id: 'group-a', name: '小云测试群', membership: 'joined' },
        { id: 'group-b', name: '另一个测试群', membership: 'joined' },
      ],
    } as unknown as QQGroupDirectory
    const policy = { isOwnerDirect: (agent: object | undefined) => agent !== undefined } as unknown as QQPolicy
    const tool = new QQMemberImpressionTool(impressions, transcript, groups, policy)

    let definition: { name?: string, parameters?: Record<string, unknown> } | undefined
    const unregister = tool.register({
      guard: () => () => {},
      restrict: () => () => {},
      register: (value) => {
        definition = value
        return () => {}
      },
    })
    expect(definition?.name).toBe('qq_group_member_impression')
    expect(definition?.parameters).toMatchObject({ required: ['operation'], additionalProperties: false })
    unregister()
    await expect(tool.execute(undefined, { operation: 'list' })).rejects.toThrow('Only the authenticated QQ owner')
    const saved = await tool.execute({}, {
      operation: 'set',
      group: '小云测试群',
      member: '薯条',
      impression: '喜欢猫，也常聊前端。',
    })
    expect(saved).toMatchObject({
      operation: 'set',
      group: { id: 'group-a', name: '小云测试群' },
      member: { id: 'sender-1234567890ab', name: '薯条' },
      impression: { text: '喜欢猫，也常聊前端。', senderName: '薯条' },
    })
    expect(await readFile(join(directory, 'impressions.md'), 'utf8')).toContain('| 薯条 | `sender-1234567890ab` |')
    expect(await tool.execute({}, { operation: 'get', group: 'group-b', member: 'sender-1234567890ab' })).toMatchObject({
      impression: { text: '喜欢猫，也常聊前端。', senderName: '薯条' },
    })
    expect(await tool.execute({}, { operation: 'list' })).toMatchObject({
      groups: [{ id: 'group-a', name: '小云测试群', members: [{ senderId: 'sender-1234567890ab', senderName: '薯条' }] }],
    })
    expect(await tool.execute({}, {
      operation: 'set',
      group: '另一个测试群',
      member: '可乐',
      impression: '喜欢喝汽水。',
    })).toMatchObject({
      impression: { text: '喜欢喝汽水。', senderName: '可乐' },
    })
    expect(await tool.execute({}, { operation: 'get', group: '小云测试群', member: 'sender-abcdef123456' })).toMatchObject({
      impression: { text: '喜欢喝汽水。', senderName: '可乐' },
    })
    expect(await tool.execute({}, { operation: 'get', group: '小云测试群', member: '薯条' })).toMatchObject({
      impression: { text: '喜欢猫，也常聊前端。', senderName: '薯条' },
    })
    expect(await tool.execute({}, { operation: 'list' })).toMatchObject({
      groups: [
        { id: 'group-a', name: '小云测试群', members: [{ senderId: 'sender-1234567890ab', senderName: '薯条' }] },
        { id: 'group-b', name: '另一个测试群', members: [{ senderId: 'sender-abcdef123456', senderName: '可乐' }] },
      ],
    })
    expect(await tool.execute({}, { operation: 'clear', group: '小云测试群', member: '薯条' })).toMatchObject({ cleared: true })
    expect(await tool.execute({}, { operation: 'get', group: '另一个测试群', member: '薯条' })).toMatchObject({ impression: null })
    expect(await tool.execute({}, { operation: 'get', group: '另一个测试群', member: '可乐' })).toMatchObject({
      impression: { text: '喜欢喝汽水。', senderName: '可乐' },
    })
    await expect(tool.execute({}, { operation: 'set', group: '不存在', member: '薯条', impression: 'x' })).rejects.toThrow('was not found')
    await impressions.close()
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
