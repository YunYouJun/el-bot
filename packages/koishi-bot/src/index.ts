import { App } from 'koishi'
import AdapterOnebot from '@koishijs/plugin-adapter-onebot'
import Common from '@koishijs/plugin-common'

import * as ping from './plugins/ping'

// 创建一个 Koishi 应用
const app = new App()

// 安装 onebot 适配器插件，并配置机器人
app.plugin(AdapterOnebot, {
  protocol: 'ws',
  selfId: '996955042',
  endpoint: 'ws://127.0.0.1:6700',
})

// 安装 common 插件，你可以不传任何配置项
app.plugin(Common)

app.plugin(ping)

// 启动应用
app.start()
