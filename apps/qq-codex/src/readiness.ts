import type { CodexReadinessClient, RemoteConfig } from './types'
import { isRecord } from 'qq-sdk/official'

/** Check account metadata and ChatGPT model configuration without spending a model turn. */
export async function checkCodexReadiness(codex: CodexReadinessClient, config: RemoteConfig): Promise<void> {
  // ACP initialization does not prove provider authentication; never submit a probe prompt.
  if (config.agent && config.agent !== 'codex')
    return
  const account = await codex.request('account/read', { refreshToken: true })
  if (!isRecord(account) || (!account.account && account.requiresOpenaiAuth !== false))
    throw new Error('Codex 尚未登录。请先在本机运行 codex login。')
  if (!isRecord(account.account) || account.account.type !== 'chatgpt')
    return

  const models = new Set<string>()
  const cursors = new Set<string>()
  let preferred: string | undefined
  let cursor: string | undefined
  do {
    const result = await codex.request('model/list', { includeHidden: true, ...(cursor ? { cursor } : {}) })
    if (!isRecord(result) || !Array.isArray(result.data))
      throw new Error('无法读取 Codex 模型目录，请检查本机 Codex 版本。')
    for (const model of result.data) {
      if (isRecord(model) && typeof model.model === 'string') {
        models.add(model.model)
        if (model.isDefault === true)
          preferred = model.model
      }
    }
    cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined
    if (cursor && (cursors.has(cursor) || cursors.size >= 20))
      throw new Error('Codex 模型目录分页无效，请检查本机 Codex 版本。')
    if (cursor)
      cursors.add(cursor)
  } while (cursor)
  if (!models.size)
    throw new Error('Codex 没有返回可用模型，请检查账户和本机版本。')

  for (const [name, cwd] of Object.entries(config.projects)) {
    const effective = await codex.request('config/read', { includeLayers: false, cwd })
    if (!isRecord(effective) || !isRecord(effective.config))
      throw new Error('无法读取 Codex 项目配置。')
    const provider = effective.config.model_provider
    // Custom providers have their own model catalogs and authentication requirements.
    if (typeof provider === 'string' && provider !== 'openai')
      continue
    const model = config.model ?? effective.config.model
    if (typeof model === 'string' && !models.has(model)) {
      const suggestion = preferred ? `可在遥控配置中设置 "model": "${preferred}"，` : '请在遥控配置中设置目录中支持的 model，'
      throw new Error(`项目 ${name} 的模型 ${model} 不在当前 ChatGPT 账户模型目录中。${suggestion}然后重新检查并重启服务。`)
    }
  }
}
