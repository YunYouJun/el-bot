import type { App } from 'koishi'
import AdapterOnebot from '@koishijs/plugin-adapter-onebot'

export function init(app: App) {
  // 安装 onebot 适配器插件，并配置机器人
  app.plugin(AdapterOnebot, {
    protocol: 'ws',
    selfId: '996955042',
    endpoint: 'ws://127.0.0.1:6700',
  })
  app.plugin('console')
  app.plugin('dataview')
  app.plugin('echo')
  app.plugin('insight')
  app.plugin('logger')
  app.plugin('manager')
  app.plugin('status')
}
