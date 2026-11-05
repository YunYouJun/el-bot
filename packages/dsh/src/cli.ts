import type { PersonaRequest } from './service'
import process from 'node:process'
import { PersonaService } from './service'

async function main() {
  const args = process.argv.slice(2)
  const read = (name: string) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : undefined
  }
  const operation = args.includes('--disable') ? 'disable' : args.includes('--use') ? 'use' : 'list'
  const service = new PersonaService()
  const request: PersonaRequest = { operation, id: read('--use'), revision: read('--revision') }
  const result = await service.request(request)
  process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`)
}
main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : '人物卡操作失败。' })}\n`)
  process.exitCode = 1
})
