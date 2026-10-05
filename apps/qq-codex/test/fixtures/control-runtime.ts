import { open, unlink } from 'node:fs/promises'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { serveControl } from '../../src/control'

// An isolated process fixture: no QQ, Codex, credentials or model connection.
async function main() {
  const state = process.argv[process.argv.indexOf('--state') + 1]
  const lock = await open(`${state}.lock`, 'wx', 0o600)
  await lock.writeFile(String(process.pid))
  await lock.close()
  await setTimeout(150)
  let closing: Promise<void> | undefined
  const close = await serveControl(state, () => ({ phase: 'running', pid: process.pid, qq: 'disconnected', codex: 'disconnected', busy: false }), async () => {
    closing ??= (async () => {
      await close()
      await unlink(`${state}.lock`)
    })()
    await closing
  })
  process.once('SIGTERM', () => {
    void close().then(() => unlink(`${state}.lock`))
  })
}
main().catch(() => {
  process.exitCode = 1
})
