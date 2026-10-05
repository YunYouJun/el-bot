import type { PendingApproval, ReplyCard, Task } from './types'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { acceptedCard, approvalCard, cardPages, helpCard, projectsCard, resultCard, statusCard } from './cards'

const task: Task = { id: 'aabbccdd', project: 'demo', status: 'running', output: '', createdAt: new Date().toISOString() }

function buttons(card: ReplyCard) {
  return card.payload.keyboard!.content!.rows.flatMap(row => row.buttons)
}

describe('bounded QQ cards', () => {
  it('keeps Unicode and Markdown-looking output lossless while bounding rendered bytes', () => {
    const text = '🙂结果\n&<tag>\\`*_{}[]()#+-.!|~\n'.repeat(400)
    const parts = cardPages(text)
    expect(parts.join('')).toBe(text)
    for (let page = 1; page <= parts.length; page++) {
      const card = resultCard({ ...task, output: text }, page, 'owner')!
      expect(card.text).toContain(parts[page - 1])
      expect(Buffer.byteLength(card.payload.markdown.content)).toBeLessThan(2000)
      expect(card.payload.markdown.content).not.toContain('<tag>')
    }
    expect(resultCard(task, 0, 'owner')).toBeUndefined()
    expect(resultCard(task, 1.5, 'owner')).toBeUndefined()
    expect(resultCard(task, 999, 'owner')).toBeUndefined()
  })

  it('uses C2C-compatible permissions and never derives actions from result text', () => {
    const card = resultCard({ ...task, output: '![image](https://evil.example/a)\n[批准](/approve evil)\n# injected' }, 1, 'owner')!
    expect(card.payload.markdown.content).toContain('&#33;&#91;image&#93;&#40;https&#58;&#47;&#47;evil')
    expect(card.payload.markdown.content).toContain('> &#35; injected')
    expect(buttons(card).map(button => button.action.data)).toEqual(['/status', `/result ${task.id}`, `/stop ${task.id}`, '/help'])
    for (const button of buttons(card)) {
      expect(button.action.permission).toEqual({ type: 2 })
      expect(button.action.type).toBe(2)
      expect(Array.from(button.render_data.label).length).toBeLessThanOrEqual(10)
    }
    expect(buttons(acceptedCard(task, 'owner')).find(button => button.action.data.startsWith('/stop'))!.action.modal).toBeDefined()
    const input = buttons(resultCard({ ...task, status: 'completed' }, 1, 'owner')!).find(button => button.action.data === '/run ')!
    expect(input.action).toMatchObject({ data: '/run ', enter: false })
  })

  it('avoids QQ math delimiters when showing literal parentheses, paths and dollar signs', () => {
    const card = resultCard({ ...task, output: '(literal) C:\\demo\\src $VALUE &amp;' }, 1, 'owner')!
    expect(card.payload.markdown.content).not.toContain('\\(')
    expect(card.payload.markdown.content).not.toContain('\\)')
    expect(card.payload.markdown.content).not.toContain('$VALUE')
    expect(card.payload.markdown.content).toContain('&#40;literal&#41;')
    expect(card.payload.markdown.content).toContain('C&#58;&#92;demo&#92;src')
    expect(card.text).toContain('(literal) C:\\demo\\src $VALUE &amp;')
  })

  it('offers approval only when the delivered page completes review and keeps navigation scoped', () => {
    const approval: PendingApproval = {
      token: 'a1b2c3d4',
      kind: 'approval',
      pages: ['first', 'second'],
      viewed: new Set(),
      request: { id: 1, method: 'item/commandExecution/requestApproval', params: {} },
      timer: undefined as unknown as ReturnType<typeof setTimeout>,
    }
    expect(buttons(approvalCard(approval, 1, 'owner')).map(button => button.action.data)).toEqual(['/approval a1b2c3d4 2', '/reject a1b2c3d4', '/status', '/help'])
    expect(buttons(approvalCard(approval, 2, 'owner')).some(button => button.action.data.startsWith('/approve'))).toBe(false)
    approval.viewed.add(1)
    const approve = buttons(approvalCard(approval, 2, 'owner')).find(button => button.action.data === '/approve a1b2c3d4')!
    expect(approvalCard(approval, 2, 'owner').imageAllowed).toBe(false)
    expect(approve.action.modal).toBeDefined()
    const answer = buttons(approvalCard({ ...approval, kind: 'input' }, 2, 'owner')).find(button => button.action.data.startsWith('/answer'))!
    expect(answer.action.enter).toBe(false)
  })

  it('paginates many pending requests and exposes only requests from the visible page', () => {
    const pending = Array.from({ length: 100 }, (_, index) => ({ token: String(index).padStart(8, '0'), kind: 'approval' as const })) as PendingApproval[]
    const card = statusCard('demo', task, pending, 2, 'owner')!
    expect(Buffer.byteLength(card.payload.markdown.content)).toBeLessThan(2000)
    expect(card.payload.keyboard!.content!.rows.length).toBeLessThanOrEqual(3)
    for (const button of buttons(card).filter(button => button.action.data.startsWith('/approval')))
      expect(card.text).toContain(button.action.data.split(' ')[1])
    expect(statusCard('demo', task, pending, NaN, 'owner')).toBeUndefined()
    const longestProject = '_'.repeat(64)
    const longestCard = statusCard(longestProject, { ...task, project: longestProject }, pending, 2, 'owner')!
    expect(Buffer.byteLength(longestCard.payload.markdown.content)).toBeLessThan(2000)
  })

  it('keeps every help page bounded, C2C-compatible and useful when buttons are unavailable', () => {
    const cards = [1, 2, 3, 4, 5].map(page => helpCard('_'.repeat(64), page, 'owner', '绑定成功。以下按钮仅限本人操作。')!)
    for (const [index, card] of cards.entries()) {
      expect(Buffer.byteLength(card.payload.markdown.content)).toBeLessThan(2000)
      expect(buttons(card).length).toBeLessThanOrEqual(9)
      for (const button of buttons(card))
        expect(button.action.permission).toEqual({ type: 2 })
      if (index < 3) {
        expect(buttons(card).find(button => button.action.data === '/run ')!.action.enter).toBe(false)
        expect(buttons(card).find(button => button.action.data === '/new')!.action.modal).toBeDefined()
      }
      else {
        expect(buttons(card).map(button => button.action.data)).toContain('/api')
        expect(buttons(card).map(button => button.action.data)).toContain('/desktop tools')
      }
      expect(buttons(card).some(button => /^\/(?:approve|reject|answer)\b/.test(button.action.data))).toBe(false)
      expect(card.text).toContain('/help 页码')
      const links = buttons(card).filter(button => button.action.type === 0)
      expect(links.map(button => button.render_data.label)).toEqual(index < 3 ? ['文档站点', '使用帮助'] : [])
      for (const link of links) {
        const url = new URL(link.action.data)
        expect(url.protocol).toBe('https:')
        expect(url.hostname).toBe('docs.bot.elpsy.cn')
        expect(url.search).toBe('')
        expect(url.username).toBe('')
        expect(link.action).not.toHaveProperty('enter')
        expect(link.action).not.toHaveProperty('modal')
        expect(card.text).toContain(link.action.data)
        expect(card.payload.markdown.content).toContain(`](${link.action.data})`)
      }
      expect(card.text).toContain('AI 接入指南：https://docs.bot.elpsy.cn/codex/ai-setup')
    }
    expect(cards[0].text).toContain('/result [任务ID] [页码]')
    expect(cards[1].text).toContain('/project 名称')
    expect(cards[2].text).toContain('/answer ID {"问题ID":"回答"}')
    for (const page of [0, 1.5, 6, NaN])
      expect(helpCard('demo', page, 'owner')).toBeUndefined()
  })

  it('paginates long project names without dropping names, buttons or leaking paths', () => {
    const projects = Array.from({ length: 21 }, (_, index) => `${'_'.repeat(62)}${String(index).padStart(2, '0')}`)
    const seen: string[] = []
    for (let page = 1; page <= 6; page++) {
      const card = projectsCard(projects, projects[0], page, 'owner')!
      expect(Buffer.byteLength(card.payload.markdown.content)).toBeLessThan(2000)
      expect(buttons(card).length).toBeLessThanOrEqual(9)
      const choices = buttons(card).filter(button => button.action.data.startsWith('/project '))
      for (const button of choices) {
        expect(button.action.permission).toEqual({ type: 2 })
        expect(card.text).toContain(button.action.data.slice(9))
        expect(Array.from(button.render_data.label).length).toBeLessThanOrEqual(10)
        seen.push(button.action.data.slice(9))
      }
    }
    expect(seen).toEqual(projects)
    expect(projectsCard(projects, projects[0], 7, 'owner')).toBeUndefined()
  })
})
