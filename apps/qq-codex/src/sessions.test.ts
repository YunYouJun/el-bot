import { describe, expect, it, vi } from 'vitest'
import { inspectSession } from './sessions'

describe('stored session diagnosis', () => {
  it('finds archived sessions across pages without resuming or unarchiving', async () => {
    const request = vi.fn(async (_method: string, _params: unknown) => ({} as unknown))
      .mockResolvedValueOnce({ thread: { id: 'saved', cwd: '/project' } })
      .mockResolvedValueOnce({ data: [], nextCursor: 'next' })
      .mockResolvedValueOnce({ data: [{ id: 'saved' }], nextCursor: null })
    expect(await inspectSession({ request }, 'demo', '/project', { id: 'saved', cwd: '/project' })).toEqual({ project: 'demo', status: 'archived' })
    expect(request.mock.calls.map(call => call[0])).toEqual(['thread/read', 'thread/list', 'thread/list'])
  })

  it('does not infer archival from runtime status and rejects malformed pagination', async () => {
    const request = vi.fn(async (_method: string, _params: unknown) => ({} as unknown))
      .mockResolvedValueOnce({ thread: { id: 'saved', cwd: '/project', status: { type: 'notLoaded' } } })
      .mockResolvedValueOnce({ data: [], nextCursor: null })
    expect((await inspectSession({ request }, 'demo', '/project', { id: 'saved', cwd: '/project' })).status).toBe('ready')
    request.mockResolvedValueOnce({ thread: { id: 'saved', cwd: '/project' } })
      .mockResolvedValueOnce({ data: [], nextCursor: 'repeat' })
      .mockResolvedValueOnce({ data: [], nextCursor: 'repeat' })
    expect((await inspectSession({ request }, 'demo', '/project', { id: 'saved', cwd: '/project' })).status).toBe('unavailable')
  })

  it('handles new, changed, missing and unavailable sessions without leaking provider errors', async () => {
    const request = vi.fn(async (_method: string, _params: unknown) => ({} as unknown))
    expect((await inspectSession({ request }, 'demo', '/project')).status).toBe('new')
    expect((await inspectSession({ request }, 'demo', '/project', { id: 'saved', cwd: '/different' })).status).toBe('project-changed')
    expect(request).not.toHaveBeenCalled()
    request.mockRejectedValueOnce(new Error('Thread not found: private account data'))
    expect((await inspectSession({ request }, 'demo', '/project', { id: 'saved', cwd: '/project' })).status).toBe('missing')
    request.mockRejectedValueOnce(new Error('connection closed: private token'))
    expect(JSON.stringify(await inspectSession({ request }, 'demo', '/project', { id: 'saved', cwd: '/project' }))).not.toContain('private')
  })
})
