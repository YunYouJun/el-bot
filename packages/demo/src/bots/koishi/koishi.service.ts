import { Injectable, Logger } from '@nestjs/common'
import { App } from 'koishi'

import AdapterOnebot from '@koishijs/plugin-adapter-onebot'

import * as Forward from '@koishijs/plugin-forward'
import * as Repeater from '@koishijs/plugin-repeater'

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
    app.plugin(ping)

    this.logger.debug('Init Koishi Plugins')
  }

  create(options?: App.Config) {
    this.logger.debug('Create Koishi Bot')
    const app = new App(options)
    try {
      this.init(app)
      this.loadCustomConfig(app)
      app.start()
      this.logger.debug('Start Koishi Bot')
    }
    catch (e) {
      console.log(e)
      this.logger.error('Some Error')
    }

    // catch unhandledRejection
    process.on('unhandledRejection', (reason, p) => {
      console.error('Unhandled Rejection at:', p, 'reason:', reason)
    })
    return this.app
  }

  loadCustomConfig(app: App) {
    Forward.apply(app, {
      rules: [
        {
          source: `onebot:${groups.first.id}`,
          target: `onebot:${groups.second.id}`,
          selfId,
        },
      ],
    })
    // 打断复读
    Repeater.apply(app, {
      onRepeat: (state, session) => {
        if (state.times > 3 && Math.random() > 0.5) {
          if (session.userId && session.guildId)
            session.onebot?.setGroupBan(session.guildId, session.userId, 600).catch(() => this.logger.error('禁言失败！'))

          return '打断复读！'
        }
      },
    })
  }
}
