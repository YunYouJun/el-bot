import { readFileSync } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { runtimeReady } from './health.mjs'

async function main() {
  try {
    const directory = join(homedir(), '.dsh-qqbot')
    const read = name => JSON.parse(readFileSync(join(directory, name), 'utf8'))
    const transport = read('cloud-runtime-status.json')
    if (!runtimeReady(read('cloud-boot.json'), transport, read('workspace-grouping-status.json')))
      throw new Error('QQ transport or workspace adapter is not ready')
    process.kill(transport.pid, 0)
    const ip = Object.values(networkInterfaces()).flat().find(x => x.family === 'IPv4' && !x.internal).address
    const response = await fetch(`http://${ip}:3080`, { signal: AbortSignal.timeout(3000) })
    if (!response.ok && response.status !== 401)
      throw new Error('DSH Web is not available')
  }
  catch {
    process.exitCode = 1
  }
}

void main()
