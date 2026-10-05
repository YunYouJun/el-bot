import { describe, expect, it } from 'vitest'
import { CodexSchema } from './schema'

describe('versioned Codex protocol catalog', () => {
  it('discovers new methods from schema and checks their required parameter types', () => {
    const schema = new CodexSchema({
      definitions: { Params: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
      oneOf: [{ type: 'object', properties: { id: { type: 'number' }, method: { enum: ['project/newApi'] }, params: { $ref: '#/definitions/Params' } }, required: ['id', 'method', 'params'] }],
    })
    expect(schema.methods).toEqual(['project/newApi'])
    expect(schema.params('project/newApi')).toHaveProperty('required', ['projectId'])
    expect(() => schema.assert('project/newApi', {})).toThrow('invalid parameters')
    expect(() => schema.assert('project/newApi', { projectId: 1 })).toThrow()
    expect(() => schema.assert('not-supported', {})).toThrow()
    expect(() => schema.assert('project/newApi', { projectId: 'existing' })).not.toThrow()
  })
})
