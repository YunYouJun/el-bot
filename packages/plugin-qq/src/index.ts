import type { AdapterPlugin } from 'el-bot/adapter'
import type { NCWebsocketOptions } from 'node-napcat-ts'
import type { NapcatAdapterOptions } from './napcat'
import type { OfficialQQAdapterOptions } from './official'
import { createNapcatClient, NapcatAdapter } from './napcat'
import { OfficialQQAdapter } from './official'

export * from './napcat'
export * from './official'
export * from './qq-guild'

export type QQPluginOptions
  = | ({ type: 'napcat', connection?: NCWebsocketOptions, debug?: boolean } & Partial<NapcatAdapterOptions>)
    | ({ type: 'official' } & OfficialQQAdapterOptions)

export function qqPlugin(options: QQPluginOptions): AdapterPlugin {
  return {
    pkg: { name: '@el-bot/plugin-qq' },
    platform: 'qq',
    setup(host) {
      host.registerAdapter(options.type === 'official'
        ? new OfficialQQAdapter(options)
        : new NapcatAdapter({
            ...options,
            client: options.client ?? createNapcatClient(options.connection ?? { protocol: 'ws', host: '127.0.0.1', port: 3001, accessToken: '' }, options.debug),
          }))
    },
  }
}

export default qqPlugin
