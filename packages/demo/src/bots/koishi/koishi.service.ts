import { Injectable, Logger } from '@nestjs/common'
import { App } from 'koishi'

import AdapterOnebot from '@koishijs/plugin-adapter-onebot'
import * as Forward from '@koishijs/plugin-forward'

// custom plugin
import ping from './plugins/ping'
// config
import { commonPlugins, groups, selfId } from './config'

@Injectable()
export class KoishiService {
  private app: App
  private readonly logger = new Logger('KoishiService')

  constructor() {
    this.app = this.create()
  }

  // app.start()

  init(app: App) {
    // 安装 onebot 适配器插件，并配置机器人
    app.plugin(AdapterOnebot, {
      protocol: 'ws',
      selfId,
      endpoint: 'ws://127.0.0.1:6700',
    })

    commonPlugins.forEach((item) => {
      app.plugin(item)
    })

    Forward.apply(app, {
      rules: [
        {
          source: `onebot:${groups.first.id}`,
          target: `onebot:${groups.second.id}`,
          selfId,
        },
      ],
    })

    app.plugin(ping)

    this.logger.debug('Init Koishi Plugins')
  }

  create(options?: App.Config) {
    this.logger.debug('Create Koishi Bot')
    const app = new App(options)
    try {
      this.init(app)
      app.start()
      this.logger.debug('Start Koishi Bot')
    }
    catch (e) {
      console.log(e)
      this.logger.error('Some Error')
    }
    return this.app
  }
}
