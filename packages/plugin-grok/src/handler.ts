import type { MessageContext } from 'el-bot/adapter'
import { Buffer } from 'node:buffer'
import { GrokAnswerError } from './responder'

export type GrokHandlerEvent = 'received' | 'answered' | 'replied' | 'busy' | 'failed' | 'reply-failed'

export interface GrokHandlerOptions {
  responder: { ask: (question: string, signal?: AbortSignal) => Promise<string> }
  /** Bind one trusted conversation to this Grok bot; do not share its history across people. */
  conversation: { adapterId: string, accountId: string, chatId: string, senderId: string }
  signal?: AbortSignal
  onEvent?: (event: GrokHandlerEvent, code?: string) => void
}

function boundedAnswer(content: string) {
  if (Buffer.byteLength(content, 'utf8') <= 18_000)
    return content
  let text = ''
  let bytes = 0
  for (const char of content) {
    bytes += Buffer.byteLength(char, 'utf8')
    if (bytes > 17_800)
      break
    text += char
  }
  return `${text}\n\n（回复过长，已截断。）`
}

/** Admit one conversation and one turn at a time, then use its bound platform reply. */
export function createGrokMessageHandler(options: GrokHandlerOptions) {
  let busy = false
  const seen = new Set<string>()
  return async (message: MessageContext) => {
    const conversation = options.conversation
    if (options.signal?.aborted || message.chat.type !== 'dm' || message.adapterId !== conversation.adapterId
      || message.accountId !== conversation.accountId || message.chat.id !== conversation.chatId || message.sender.id !== conversation.senderId
      || !message.text.trim() || seen.has(message.id)) {
      return
    }
    seen.add(message.id)
    if (seen.size > 1000)
      seen.delete(seen.values().next().value!)
    if (busy) {
      options.onEvent?.('busy')
      await message.reply('正在处理上一条问题，请稍后再发。')
      return
    }
    busy = true
    options.onEvent?.('received')
    try {
      let answer: string
      try {
        answer = await options.responder.ask(message.text, options.signal)
        options.onEvent?.('answered')
      }
      catch (error) {
        options.onEvent?.('failed', error instanceof GrokAnswerError ? error.code : 'GROK_REQUEST_FAILED')
        answer = 'Grok Bot 暂未完成这次问答，请稍后再试。'
      }
      if (!options.signal?.aborted) {
        await message.reply(boundedAnswer(answer))
        options.onEvent?.('replied')
      }
    }
    catch {
      options.onEvent?.('reply-failed')
    }
    finally {
      busy = false
    }
  }
}
