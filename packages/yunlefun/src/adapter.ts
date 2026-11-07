import type { AgentInput, Model, YunlefunService } from './service'
import { hash, object, YunlefunError } from './protocol'

export const PROVIDER = 'yunlefun'
export interface GenerateOptions {
  provider: string
  model: string
  messages: unknown[]
  tools?: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }[]
  system?: string
  temperature?: number
  maxTokens?: number
  reasoningEffort?: string
  stop?: string[]
  sessionId?: string
  purpose?: string
  signal?: AbortSignal
}
interface Chunk {
  type: string
  [key: string]: unknown
}
interface Adapter {
  stream: (options: GenerateOptions) => AsyncIterable<Chunk>
}
export interface AdapterBase {
  new (): object
}
export function serialize(options: GenerateOptions, model: Model): AgentInput {
  if (options.reasoningEffort || options.stop?.length)
    throw new YunlefunError('UNSUPPORTED_GENERATION_CONTROL')
  const messages: Record<string, unknown>[] = []
  if (options.system)
    messages.push({ role: 'system', content: options.system })
  for (const raw of options.messages) {
    const message = object(raw)
    if (!['system', 'developer', 'user', 'assistant', 'tool'].includes(String(message.role)) || !Array.isArray(message.content))
      throw new YunlefunError('UNSUPPORTED_MESSAGE')
    let text = ''
    let reasoning = ''
    const calls: Record<string, unknown>[] = []
    for (const rawBlock of message.content) {
      const block = object(rawBlock)
      if (block.type === 'text' && typeof block.text === 'string')
        text += block.text
      else if (block.type === 'reasoning' && typeof block.text === 'string' && message.role === 'assistant')
        reasoning += block.text
      else if (block.type === 'tool-call' && typeof block.id === 'string' && typeof block.name === 'string' && typeof block.arguments === 'string' && message.role === 'assistant')
        calls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: block.arguments } })
      else
        throw new YunlefunError('UNSUPPORTED_CONTENT')
    }
    const result: Record<string, unknown> = { role: message.role === 'developer' ? 'system' : message.role, content: text || (calls.length ? null : '') }
    if (calls.length)
      result.tool_calls = calls
    if (message.role === 'tool') {
      if (typeof message.toolCallId !== 'string')
        throw new YunlefunError('INVALID_TOOL_RESULT')
      result.tool_call_id = message.toolCallId
    }
    if (reasoning && message.source && object(message.source).provider === PROVIDER)
      result.reasoning_content = reasoning
    messages.push(result)
  }
  const maxOutputTokens = options.maxTokens ?? Math.min(4096, model.maxOutputTokens)
  const temperatureMilli = Math.round((options.temperature ?? 0.7) * 1000)
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > model.maxOutputTokens || !Number.isSafeInteger(temperatureMilli) || temperatureMilli < 0 || temperatureMilli > 2000)
    throw new YunlefunError('INVALID_GENERATION_LIMIT')
  return { messages, tools: (options.tools ?? []).map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })), maxOutputTokens, temperatureMilli }
}
function metadata(model: Model) {
  return { provider: PROVIDER, id: model.modelId, name: model.displayName, description: '消耗已授权云乐坊账户的 AI 点数', inputModalities: ['text'], defaultMaxTokens: Math.min(4096, model.maxOutputTokens) }
}
interface RuntimeAdapter extends Adapter {
  providerInfo: (provider: string) => {
    id: string
    name: string
  }
  listModels: () => Promise<ReturnType<typeof metadata>[]>
  resolveModel: (provider: string, id: string, signal?: AbortSignal) => Promise<ReturnType<typeof metadata>>
  prepareCall: (provider: string, id: string, signal?: AbortSignal) => Promise<{
    model: ReturnType<typeof metadata>
    stream: (options: GenerateOptions) => AsyncIterable<Chunk>
  }>
}
/** Use the host's adapter base so registration and module identity match its exact DSH build. */
export function createAdapter(Base: AdapterBase, service: YunlefunService): RuntimeAdapter {
  return new class extends Base {
    providerInfo(provider: string) {
      return { id: provider, name: '云乐坊 AI 点数' }
    }

    async listModels() {
      if (!service.store.snapshot.authorization)
        return []
      return (await service.catalog()).models.map(metadata)
    }

    async prepareCall(provider: string, id: string, signal?: AbortSignal) {
      if (provider !== PROVIDER)
        throw new YunlefunError('MODEL_DISABLED')
      const model = (await service.catalog(signal)).models.find(item => item.modelId === id)
      if (!model)
        throw new YunlefunError('MODEL_DISABLED')
      const uid = service.store.snapshot.authorization?.uid
      return { model: metadata(model), stream: (options: GenerateOptions) => this.generate(options, model, uid) }
    }

    async resolveModel(provider: string, model: string, signal?: AbortSignal) {
      return (await this.prepareCall(provider, model, signal)).model
    }

    async* stream(options: GenerateOptions) {
      const prepared = await this.prepareCall(options.provider, options.model, options.signal)
      yield* prepared.stream(options)
    }

    private async* generate(options: GenerateOptions, model: Model, uid?: string): AsyncIterable<Chunk> {
      try {
        if (uid !== service.store.snapshot.authorization?.uid || !uid)
          throw new YunlefunError('ACCOUNT_CHANGED', 401)
        const input = serialize(options, model)
        // Durable DSH message IDs distinguish repeated questions. Exact failed calls retain their request ID.
        const fingerprint = hash(JSON.stringify({ provider: PROVIDER, model: model.modelId, messages: options.messages, system: options.system, tools: options.tools, maxTokens: input.maxOutputTokens, temperature: input.temperatureMilli, sessionId: options.sessionId, purpose: options.purpose }))
        const snapshot = await service.generate(model, input, fingerprint, options.signal)
        const result = object(snapshot.result)
        const message = object(result.message)
        if (message.role !== 'assistant' || (typeof message.content !== 'string' && message.content !== null) || !['stop', 'length', 'tool_calls'].includes(String(result.finishReason)))
          throw new YunlefunError('INVALID_RESPONSE', 503)
        const usage = object(snapshot.usage)
        for (const field of ['inputTokens', 'outputTokens', 'totalTokens', 'chargedMicroPoints']) {
          if (!Number.isSafeInteger(usage[field]) || Number(usage[field]) < 0)
            throw new YunlefunError('INVALID_USAGE', 503)
        }
        let index = 0
        if (typeof message.reasoning_content === 'string' && message.reasoning_content) {
          yield { type: 'block-start', index, blockType: 'reasoning' }
          yield { type: 'reasoning-delta', index, text: message.reasoning_content }
          yield { type: 'block-end', index: index++, block: { type: 'reasoning', text: message.reasoning_content } }
        }
        if (message.content) {
          yield { type: 'block-start', index, blockType: 'text' }
          yield { type: 'text-delta', index, text: message.content }
          yield { type: 'block-end', index: index++, block: { type: 'text', text: message.content } }
        }
        if (message.tool_calls !== undefined) {
          if (!Array.isArray(message.tool_calls) || message.tool_calls.length > 32)
            throw new YunlefunError('INVALID_RESPONSE', 503)
          for (const raw of message.tool_calls) {
            const call = object(raw)
            const fn = object(call.function)
            if (typeof call.id !== 'string' || typeof fn.name !== 'string' || typeof fn.arguments !== 'string' || !(options.tools ?? []).some(tool => tool.name === fn.name))
              throw new YunlefunError('INVALID_TOOL_CALL', 503)
            object(JSON.parse(fn.arguments))
            yield { type: 'block-start', index, blockType: 'tool-call' }
            yield { type: 'tool-call-delta', index, id: call.id, name: fn.name, argumentsDelta: fn.arguments }
            yield { type: 'block-end', index: index++, block: { type: 'tool-call', id: call.id, name: fn.name, arguments: fn.arguments } }
          }
        }
        yield { type: 'usage', usage: { inputTokens: usage.inputTokens, outputTokens: Number(usage.outputTokens) + Number(usage.reasoningTokens ?? 0), cacheReadTokens: usage.cachedInputTokens, reasoningTokens: usage.reasoningTokens, totalTokens: usage.totalTokens } }
        yield { type: 'finish', reason: { kind: result.finishReason === 'tool_calls' ? 'tool-calls' : result.finishReason === 'length' ? 'max-tokens' : 'stop' } }
      }
      catch (error) {
        const code = error instanceof YunlefunError ? error.code : 'YUNLEFUN_UNAVAILABLE'
        const message = code === 'AI_POINTS_INSUFFICIENT' ? '云乐坊 AI 点数不足，请充值或手动切换个人 Key。' : code === 'TASK_PENDING' || code === 'BILLING_PENDING' || code === 'NETWORK_UNCERTAIN' ? '任务结果或账务待确认，请在云乐坊 AI 设置中恢复查询；不会自动新建付费请求。' : `云乐坊 AI 调用未完成（${code}），请检查授权与模型设置。`
        yield { type: 'finish', reason: { kind: options.signal?.aborted ? 'aborted' : 'error', failure: { code, message, ...(error instanceof YunlefunError ? { status: error.status } : {}) } } }
      }
    }
  }()
}
