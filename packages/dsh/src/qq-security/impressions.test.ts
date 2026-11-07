import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { impressionText, QQMemberImpressions } from './impressions'

it('shares one member impression across groups and clears it globally', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-impressions-'))
  try {
    const path = join(directory, 'impressions.json')
    const mirror = join(directory, 'impressions.md')
    const store = new QQMemberImpressions(path, () => Date.parse('2026-11-07T08:00:00.000Z'))
    await store.load()
    expect(store.get('member-1')).toBeUndefined()
    const saved = await store.set('group-a', 'member-1', '  喜欢猫，也  常聊前端。 | <b> ', {
      groupName: '小云测试群',
      senderName: '薯条',
    })
    expect(saved).toEqual({ text: '喜欢猫，也 常聊前端。 | <b>', updatedAt: '2026-11-07T08:00:00.000Z', senderName: '薯条' })
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect((await stat(mirror)).mode & 0o777).toBe(0o600)
    const markdown = await readFile(mirror, 'utf8')
    expect(markdown).toContain('# 小云对群成员的印象')
    expect(markdown).toContain('## 小云测试群')
    expect(markdown).toContain('群 OpenID：`group-a`')
    expect(markdown).toContain('| 薯条 | `member-1` | 喜欢猫，也 常聊前端。 \\| &lt;b&gt; | 2026-11-07T08:00:00.000Z |')
    expect(markdown).toContain('覆盖 1 名成员')
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      version: 3,
      groupNames: { 'group-a': '小云测试群' },
      members: { 'member-1': { senderName: '薯条' } },
      groups: { 'group-a': ['member-1'] },
    })
    const updated = await store.set('group-b', 'member-1', '也常出现在另一个群。', {
      groupName: '另一个群',
      senderName: '薯条',
    })
    expect(store.get('member-1')).toEqual(updated)
    expect(store.list('group-a')).toEqual([{ groupId: 'group-a', senderId: 'member-1', groupName: '小云测试群', ...updated }])
    expect(store.list('group-b')).toEqual([{ groupId: 'group-b', senderId: 'member-1', groupName: '另一个群', ...updated }])
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      version: 3,
      members: { 'member-1': { text: '也常出现在另一个群。', senderName: '薯条' } },
      groups: { 'group-a': ['member-1'], 'group-b': ['member-1'] },
    })
    await store.close()

    await rm(mirror, { force: true })
    const restarted = new QQMemberImpressions(path)
    await restarted.load()
    expect(await readFile(mirror, 'utf8')).toContain('| 薯条 |')
    expect(restarted.get('member-1')).toEqual(updated)
    expect(restarted.list('group-a')).toEqual([{ groupId: 'group-a', senderId: 'member-1', groupName: '小云测试群', ...updated }])
    expect(restarted.list('group-b')).toEqual([{ groupId: 'group-b', senderId: 'member-1', groupName: '另一个群', ...updated }])
    expect(await restarted.clear('member-1')).toBe(true)
    expect(await restarted.clear('member-1')).toBe(false)
    expect(restarted.get('member-1')).toBeUndefined()
    expect(restarted.list('group-a')).toEqual([])
    expect(restarted.list('group-b')).toEqual([])
    const cleared = await readFile(mirror, 'utf8')
    expect(cleared).toContain('_暂无印象。_')
    expect(cleared).not.toContain('薯条')
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('rejects oversized, empty and malformed impressions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-impressions-'))
  try {
    const path = join(directory, 'impressions.json')
    const store = new QQMemberImpressions(path)
    await store.load()
    expect(() => impressionText('   ')).toThrow('1-280')
    expect(() => impressionText('a'.repeat(281))).toThrow('1-280')
    await expect(store.set('bad group', 'member-1', 'ok')).rejects.toThrow('Invalid')
    await expect(store.set('group-a', 'member 1', 'ok')).rejects.toThrow('Invalid')
    await store.set('group-a', 'member-1', 'ok')
    await store.close()

    await writeFile(path, '{"version":1,"groups":{"group-a":{"member-1":{"text":"ok","updatedAt":"nope"}}}}\n')
    const restarted = new QQMemberImpressions(path)
    await restarted.load()
    expect(restarted.get('member-1')).toBeUndefined()

    await writeFile(path, '{"version":1')
    const broken = new QQMemberImpressions(path)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(broken.load()).resolves.toBeUndefined()
      expect(broken.list()).toEqual([])
    }
    finally { logged.mockRestore() }
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('loads the original JSON shape and regenerates the Markdown mirror', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-impressions-'))
  try {
    const path = join(directory, 'impressions.json')
    await writeFile(path, `${JSON.stringify({
      version: 1,
      groups: {
        'group-a': {
          'member-1': { text: '旧版印象', updatedAt: '2026-11-07T08:00:00Z' },
        },
      },
    })}\n`)
    const store = new QQMemberImpressions(path, () => Date.parse('2026-11-07T09:00:00Z'))
    await store.load()
    expect(store.get('member-1')).toEqual({ text: '旧版印象', updatedAt: '2026-11-07T08:00:00.000Z' })
    const markdown = await readFile(join(directory, 'impressions.md'), 'utf8')
    expect(markdown).toContain('## group-a')
    expect(markdown).toContain('| （未记录昵称） | `member-1` | 旧版印象 |')
    await store.set('group-a', 'member-1', '新版印象', { groupName: '测试群', senderName: '薯条' })
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      version: 3,
      groupNames: { 'group-a': '测试群' },
      members: { 'member-1': { text: '新版印象', senderName: '薯条' } },
      groups: { 'group-a': ['member-1'] },
    })
    await store.close()
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})

it('merges duplicate v2 identities into the newest impression without losing group links', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-impressions-'))
  try {
    const path = join(directory, 'impressions.json')
    await writeFile(path, `${JSON.stringify({
      version: 2,
      groups: {
        'group-a': {
          'member-1': { text: '旧印象', updatedAt: '2026-11-07T08:00:00Z', senderName: '旧昵称' },
        },
        'group-b': {
          'member-1': { text: '新印象', updatedAt: '2026-11-07T09:00:00Z', senderName: '新昵称' },
          'member-2': { text: '另一个人', updatedAt: '2026-11-07T09:30:00Z' },
        },
      },
      groupNames: { 'group-a': '甲群', 'group-b': '乙群' },
    })}\n`)
    const store = new QQMemberImpressions(path, () => Date.parse('2026-11-07T10:00:00Z'))
    await store.load()
    expect(store.get('member-1')).toEqual({ text: '新印象', updatedAt: '2026-11-07T09:00:00.000Z', senderName: '新昵称' })
    expect(store.list('group-a')).toEqual([{
      groupId: 'group-a',
      senderId: 'member-1',
      groupName: '甲群',
      text: '新印象',
      updatedAt: '2026-11-07T09:00:00.000Z',
      senderName: '新昵称',
    }])
    expect(store.list('group-b').map(entry => entry.senderId)).toEqual(['member-1', 'member-2'])
    await store.set('group-b', 'member-2', '更新另一个人')
    const saved = JSON.parse(await readFile(path, 'utf8'))
    expect(saved).toMatchObject({
      version: 3,
      members: {
        'member-1': { text: '新印象', senderName: '新昵称' },
        'member-2': { text: '更新另一个人' },
      },
      groups: { 'group-a': ['member-1'], 'group-b': ['member-1', 'member-2'] },
    })
    await store.close()
  }
  finally { await rm(directory, { recursive: true, force: true }) }
})
