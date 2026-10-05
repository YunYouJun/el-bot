import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

/**
 * Start the existing TypeScript bot runtime only for legacy bot commands.
 * @param args - Arguments forwarded to the original bot launcher
 * @returns Resolves when the bot process exits, preserving its exit status
 * @throws If the legacy runtime cannot be started
 */
export async function runLegacy(args: string[]): Promise<void> {
  const require = createRequire(import.meta.url)
  const entry = resolve(dirname(require.resolve('el-bot')), 'bin/legacy.ts')
  const child = spawn(process.execPath, [require.resolve('vite-node/cli'), '--script', entry, ...args], { stdio: 'inherit' })
  const interrupt = () => {
    child.kill('SIGINT')
  }
  const terminate = () => {
    child.kill('SIGTERM')
  }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143)
        resolve()
      })
    })
  }
  finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
  }
}
