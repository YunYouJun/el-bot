import type { GrokHandlerEvent, GrokWebhookResponder } from '@el-bot/plugin-grok'
import type { WecomSmartBotConfig } from '@el-bot/plugin-wecom'
import { createGrokMessageHandler } from '@el-bot/plugin-grok'
import { wecomPlugin } from '@el-bot/plugin-wecom'
import { AdapterRegistry } from 'el-bot/adapter'

export interface WecomGrokBinding {
  wecomBotId: string
  ownerUserId: string
  grokBotName?: string
}

export async function startWecomGrok(options: {
  wecom: WecomSmartBotConfig
  binding: WecomGrokBinding
  responder: Pick<GrokWebhookResponder, 'ask'>
  signal?: AbortSignal
  onEvent?: (event: GrokHandlerEvent | 'ready', code?: string) => void
}) {
  const { binding, wecom } = options
  if (binding.wecomBotId !== wecom.botId || !binding.ownerUserId)
    throw new Error('A matching WeCom bot and verified SDK owner are required')
  const registry = new AdapterRegistry()
  const control = new AbortController()
  const signal = options.signal ? AbortSignal.any([control.signal, options.signal]) : control.signal
  const handler = createGrokMessageHandler({
    responder: options.responder,
    conversation: { adapterId: 'wecom:grok', accountId: wecom.botId, chatId: binding.ownerUserId, senderId: binding.ownerUserId },
    signal,
    onEvent: options.onEvent,
  })
  wecomPlugin({
    id: 'wecom:grok',
    botId: wecom.botId,
    secret: wecom.secret,
    wsUrl: wecom.wsUrl,
    heartbeatIntervalMs: wecom.heartbeatIntervalMs,
    onError: () => options.onEvent?.('failed', 'WECOM_CONNECTION_ERROR'),
  }).setup({ registerAdapter: adapter => registry.register(adapter) })
  try {
    await registry.start(handler)
    options.onEvent?.('ready')
  }
  catch (error) {
    control.abort()
    await registry.stop()
    throw error
  }
  return {
    async stop() {
      control.abort()
      await registry.stop()
    },
  }
}
