import { Adapter } from 'koishi'
import { HttpServer } from './http'
import { WebSocketClient, WebSocketServer } from './ws'
import * as Mirai from './types'

declare module 'koishi' {
  interface Modules {
    'adapter-mirai': typeof import('.')
  }

  interface Session {
    mirai?: Mirai.Payload & Mirai.Internal
  }
}

export { Mirai }

export * from './bot'
export * from './ws'
export * from './http'

export default Adapter.define('mirai', MiraiBot, {
  'http': HttpServer,
  'ws': WebSocketClient,
  'ws-reverse': WebSocketServer,
}, ({ endpoint }) => {
  return !endpoint ? 'ws-reverse' : endpoint.startsWith('ws') ? 'ws' : 'http'
})
