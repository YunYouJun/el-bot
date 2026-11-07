import { expect, it } from 'vitest'
import { personaRequest } from './personas'

it('normalizes HTTPS imports without accepting native filesystem or general service requests', () => {
  expect(personaRequest({ operation: 'import', input: { kind: 'url', url: 'https://EXAMPLE.com/card.md' } }))
    .toEqual({ operation: 'import', input: { kind: 'url', url: 'https://example.com/card.md' } })
  expect(personaRequest({ operation: 'import', input: { kind: 'git', repository: 'https://example.com/repo.git', path: 'cards/cloud.md', ref: 'v1' } }))
    .toEqual({ operation: 'import', input: { kind: 'git', repository: 'https://example.com/repo.git', path: 'cards/cloud.md', ref: 'v1' } })
  expect(personaRequest({ operation: 'update', id: 'cloud' })).toEqual({ operation: 'update', id: 'cloud' })
  for (const input of [null, [], { kind: 'text', name: 'card.md', text: '' }, { kind: 'git', repository: 'https://example.com/r?token=x', path: 'c.md' }])
    expect(() => personaRequest({ operation: 'import', input })).toThrow('invalid_persona_request')
})
