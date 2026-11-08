import type { Argv } from 'yargs'
import { describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  createBot: vi.fn(),
}))

vi.mock('el-bot', () => ({ createBot: runtime.createBot }))
vi.mock('../packages/el-bot/core', () => {
  throw new Error('The legacy launcher must use the bundled framework')
})
vi.mock('../packages/el-bot/node/cli/utils', () => ({ bindShortcut: vi.fn() }))

describe('legacy CLI framework loading', () => {
  it('loads the public framework before starting an offline bot', async () => {
    const { registerDevCommand } = await import('../packages/el-bot/node/cli/commands/dev')
    let handler: ((options: { root: string }) => Promise<void>) | undefined
    const cli = {
      command: vi.fn((_name, _description, _options, action) => {
        handler = action
      }),
    }
    runtime.createBot.mockResolvedValue({ start: runtime.start, stop: runtime.stop })
    registerDevCommand(cli as unknown as Argv)
    expect(handler).toBeDefined()
    await handler!({ root: '/offline-fixture' })
    expect(runtime.createBot).toHaveBeenCalledWith('/offline-fixture')
    expect(runtime.start).toHaveBeenCalledOnce()
  })
})
