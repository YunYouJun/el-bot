import type { BotCredentials } from './types'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { parse } from 'dotenv'

/** Load only QQ credentials; never copy unrelated dotenv values into Codex's environment. */
export async function readCredentials(envFile: string, explicit = false, env: NodeJS.ProcessEnv = process.env, legacyFile = '.env'): Promise<BotCredentials> {
  async function read(filename: string, required: boolean) {
    try {
      return parse(await readFile(filename))
    }
    catch (error) {
      if (!required && (error as NodeJS.ErrnoException).code === 'ENOENT')
        return {}
      throw new Error(`无法读取凭据文件：${filename}`)
    }
  }
  const file = await read(envFile, explicit)
  const legacy = explicit ? {} : await read(legacyFile, false)
  const secret = (values: NodeJS.ProcessEnv) => values.QQ_BOT_SECRET || values.QQ_BOT_APP_SECRET
  // An explicit file is authoritative. Never combine halves from different sources.
  for (const source of explicit ? [file] : [env, file, legacy]) {
    const appId = source.QQ_BOT_APP_ID || ''
    const value = secret(source) || ''
    if (!appId && !value)
      continue
    if (!appId || !value)
      throw new Error('同一个凭据来源必须同时提供 QQ_BOT_APP_ID 和 QQ_BOT_SECRET，不能混用不同环境的凭据。')
    return { appId, secret: value }
  }
  throw new Error('缺少 QQ_BOT_APP_ID / QQ_BOT_SECRET。请运行 el-bot codex init，或通过 --credentials 指定凭据文件。')
}
