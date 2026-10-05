import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serveControl } from './control'
import { replyPreferences } from './preferences'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse())
    await cleanup()
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'el-preferences-'))
  cleanups.push(() => rm(directory, { recursive: true, force: true }))
  const config = join(directory, 'config.json')
  const state = join(directory, 'state.json')
  const raw = { projects: { demo: '.' }, defaultProject: 'demo', ownerOpenId: 'private-owner', management: { enabled: false }, image: { transport: 'upload', theme: 'dark' }, futureOption: { keep: true } }
  await writeFile(config, JSON.stringify(raw), { mode: 0o600 })
  return { config, state, raw }
}

describe('reply presentation settings', () => {
  it('reads defaults without exposing other config or creating state', async () => {
    const { config, state } = await fixture()
    expect(await replyPreferences(config, state)).toEqual({ messageFormat: 'markdown', imageTheme: 'dark', restartRequired: false })
    await expect(stat(state)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('round trips formats and themes while retaining all unrelated configuration', async () => {
    const { config, state, raw } = await fixture()
    for (const messageFormat of ['image', 'text', 'markdown'] as const) {
      const reply = await replyPreferences(config, state, { messageFormat, imageTheme: 'light' })
      expect(reply).toEqual({ messageFormat, imageTheme: 'light', restartRequired: false })
      expect(JSON.parse(await readFile(config, 'utf8'))).toEqual({ ...raw, messageFormat, image: { ...raw.image, theme: 'light' } })
    }
    if (process.platform !== 'win32')
      expect((await stat(config)).mode & 0o777).toBe(0o600)
  })

  it('marks restart required for a live instance without stopping it or touching its state', async () => {
    const { config, state } = await fixture()
    await writeFile(`${state}.lock`, String(process.pid))
    const stop = vi.fn(async () => {})
    cleanups.push(await serveControl(state, () => ({ phase: 'running', qq: 'connected', codex: 'connected', busy: true }), stop))
    expect((await replyPreferences(config, state, { messageFormat: 'image' })).restartRequired).toBe(true)
    expect(stop).not.toHaveBeenCalled()
    await expect(stat(state)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects invalid values and concurrent writers without changing the config', async () => {
    const { config, state } = await fixture()
    const before = await readFile(config, 'utf8')
    // Runtime callers must also be checked; the CLI choices alone are insufficient.
    await expect(replyPreferences(config, state, { messageFormat: 'shell' as 'text' })).rejects.toThrow('回复格式')
    await writeFile(`${config}.preferences.lock`, '')
    await expect(replyPreferences(config, state, { messageFormat: 'image' })).rejects.toThrow('正在保存')
    expect(await readFile(config, 'utf8')).toBe(before)
  })
})
