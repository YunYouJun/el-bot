import type { EventEmitter } from 'events'
import type { IncomingMessage, ServerResponse } from 'http'
import shell from 'shelljs'

import { Webhooks, createNodeMiddleware } from '@octokit/webhooks'
import type { Bot } from 'el-bot'

// github handler
export interface handler extends EventEmitter {
  (
    req: IncomingMessage,
    res: ServerResponse,
    callback: (err: Error) => void
  ): void
}

export default function(ctx: Bot) {
  const config = {
    secret: ctx.el.webhook?.secret || 'el-psy-congroo',
  }

  const handler = new Webhooks(config)

  const middleware = createNodeMiddleware(handler, {
    path: ctx.el.webhook?.path || '/webhook',
  })

  handler.onError((err) => {
    ctx.logger.error(`Error: ${err.message}`)
  })

  // 处理
  handler.on('push', (event) => {
    ctx.logger.info(
      `Received a push event for ${event.payload.repository.name} to ${event.payload.ref}`,
    )

    // git pull repo
    if (shell.exec('git pull').code !== 0) {
      ctx.logger.error('Git 拉取失败，请检查默认分支。')
    }
    else {
      ctx.logger.info('安装依赖...')
      shell.exec('yarn')
    }
  })

  return {
    handler,
    middleware,
  }
}
