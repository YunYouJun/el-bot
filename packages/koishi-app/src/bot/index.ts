import type { App } from 'koishi'
import * as Forward from '@koishijs/plugin-forward'
import ping from '../plugins/ping'
import { init } from './init'

const groups = {
  first: {
    name: '机器人测试群',
    id: 120117362,
  },
  second: {
    name: '测试群二号',
    id: 275834309,
  },
}

export function setup(app: App) {
  init(app)

  app.plugin(ping)
  console.log(app.database)

  try {
    Forward.apply(app, {
      rules: [
        {
          source: `onebot:${groups.first.id}`,
          target: `onebot:${groups.second.id}`,
          selfId: '996955042',
        },
      ],
    })
  }
  catch {

  }
  // app.plugin()
}
