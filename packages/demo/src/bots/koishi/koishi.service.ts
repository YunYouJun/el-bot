import { Injectable, Logger } from '@nestjs/common'
import { App } from 'koishi'

import AdapterOnebot from '@koishijs/plugin-adapter-onebot'

import * as Forward from '@koishijs/plugin-forward'
import * as Repeater from '@koishijs/plugin-repeater'

// 快捷回复 https://koishi.js.org/plugins/common/respondent.html
import * as Respondent from '@koishijs/plugin-respondent'

// custom plugin
import * as ping from './plugins/ping'
// config
import * as config from './config'
import type { PluginOptions } from './config'

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
      selfId: config.selfId,
      endpoint: 'ws://127.0.0.1:6700',
    })

    config.commonPlugins.forEach((item) => {
      app.plugin(item)
    })

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

  async loadCustomConfig(app: App) {
    // jrmsn.apply(app,)

    for (const name in config.plugins) {
      const plugin = await import(`./plugins/${name}`)
      plugin.apply(app, config.plugins[name as (keyof PluginOptions)])
    }

    ping.apply(app)
    Forward.apply(app, {
      rules: [
        {
          source: `onebot:${config.groups.first.id}`,
          target: `onebot:${config.groups.second.id}`,
          selfId: config.selfId,
        },
      ],
    })
    // 打断复读
    Repeater.apply(app, {
      onRepeat: (state, session) => {
        // console.log(session)
        // Logger.error('sess', '')
        // 随着复读次数，禁言概率不断增加
        if (state.times > 4 && Math.random() < (state.times / 10)) {
          if (session.userId && session.guildId)
            session.onebot?.setGroupBan(session.guildId, session.userId, state.times * 100).catch(() => this.logger.error('禁言失败！'))

          return '打断复读！'
        }
      },
    })
    Respondent.apply(app, config.respondent.config)
  }
}
