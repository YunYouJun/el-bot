import { describe, expect, it } from 'vitest'
import { curatedPersonaImport, curatedPersonaMarket } from '../web/persona-market'

describe('curated DSH persona market', () => {
  it('keeps a reviewed public Git source and imports one card at a time', () => {
    expect(curatedPersonaMarket.repository).toBe('https://github.com/huaizhuanghub/dsh-persona-repository.git')
    expect(curatedPersonaMarket.browseURL).toBe('https://github.com/huaizhuanghub/dsh-persona-repository')
    expect(curatedPersonaMarket.ref).toBe('main')
    expect(curatedPersonaMarket.reviewedCommit).toMatch(/^[a-f0-9]{40}$/)
    expect(curatedPersonaMarket.reviewedAt).toBe('2026-11-08')
    expect(curatedPersonaMarket.cards).toHaveLength(7)

    for (const card of curatedPersonaMarket.cards) {
      expect(curatedPersonaImport(card)).toEqual({
        kind: 'git',
        repository: curatedPersonaMarket.repository,
        path: card.path,
        ref: 'main',
      })
    }
  })

  it('keeps paths, ids, attribution, and per-card licenses explicit and unique', () => {
    const paths = new Set<string>()
    const ids = new Set<string>()

    for (const card of curatedPersonaMarket.cards) {
      const match = /^personas\/([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)\.md$/.exec(card.path)
      expect(match, card.path).not.toBeNull()
      expect(match?.[1]).toBe(card.author)
      expect(match?.[2]).toBe(card.id)
      expect(card.id).toMatch(/^[a-z0-9][a-z0-9_-]{0,63}$/)
      expect(card.name.trim()).not.toBe('')
      expect(card.summary.trim()).not.toBe('')
      expect(card.tags.length).toBeGreaterThan(0)
      expect(card.license).toMatch(/^(?:MIT|CC-BY-4\.0)$/)
      expect(paths.has(card.path)).toBe(false)
      expect(ids.has(card.id)).toBe(false)
      paths.add(card.path)
      ids.add(card.id)
    }

    expect(ids.has('dafeiyu')).toBe(false)
    expect(paths.has('personas/huaizhuanghub/dafeiyu.md')).toBe(false)
  })
})
