import type { ValidateFunction } from 'ajv'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { Ajv } from 'ajv'

const execute = promisify(execFile)
type Schema = Record<string, unknown>

/** Generated from the installed executable, never a hardcoded protocol version. */
export class CodexSchema {
  readonly methods: string[]
  private validate: ValidateFunction

  constructor(readonly schema: Schema) {
    const variants = schema.oneOf
    if (!Array.isArray(variants))
      throw new Error('Invalid Codex ClientRequest schema')
    this.methods = variants.flatMap((variant) => {
      const method = variant?.properties?.method?.enum?.[0]
      return typeof method === 'string' ? [method] : []
    }).sort()
    this.validate = new Ajv({ strict: false, validateFormats: false }).compile(schema)
  }

  params(method: string): unknown {
    const variants = this.schema.oneOf as Schema[]
    const variant = variants.find(value => (value.properties as any)?.method?.enum?.[0] === method)
    const params = (variant?.properties as Schema | undefined)?.params as Schema | undefined
    const reference = typeof params?.$ref === 'string' ? params.$ref.split('/').at(-1) : undefined
    return reference ? (this.schema.definitions as Schema)[reference] : params
  }

  assert(method: string, params: unknown): void {
    if (!this.methods.includes(method) || !this.validate({ id: 1, method, params }))
      throw new Error('Unknown API or invalid parameters; inspect /api schema first')
  }

  static async load(executable = 'codex', experimental = false): Promise<CodexSchema> {
    const directory = await mkdtemp(join(tmpdir(), 'el-bot-codex-schema-'))
    try {
      const env = { ...process.env }
      for (const key of Object.keys(env)) {
        if (key.startsWith('QQ_BOT_'))
          delete env[key]
      }
      await execute(executable, ['app-server', 'generate-json-schema', '--out', directory, ...(experimental ? ['--experimental'] : [])], {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env,
      })
      return new CodexSchema(JSON.parse(await readFile(join(directory, 'ClientRequest.json'), 'utf8')))
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
