import type { MessageContext } from 'el-bot/adapter'
import type { GrokHandlerOptions } from './handler'
import { createGrokMessageHandler } from './handler'

export function grokPlugin(options: GrokHandlerOptions) {
  return {
    pkg: { name: '@el-bot/plugin-grok' },
    setup(host: { hooks: { hook: (name: 'onSession', handler: (message: MessageContext) => Promise<void>) => unknown } }) {
      host.hooks.hook('onSession', createGrokMessageHandler(options))
    },
  }
}
