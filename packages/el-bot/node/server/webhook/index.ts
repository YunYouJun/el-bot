import type { Hono } from 'hono'
import type { Bindings } from '../hono'
import { Buffer } from 'node:buffer'
import { createNodeMiddleware } from '@octokit/webhooks'
import consola from 'consola'
// import * as octokit from '@octokit/webhooks'
// import { githubHandler } from './github-handler'
import colors from 'picocolors'
import { createOctokitWebhooks } from './octokit'

import { WebhooksOptions } from './types'

export * from './types'

/**
 * create webhook
 * - github
 * @param app
 */
export function createWebhooks(app: Hono<{ Bindings: Bindings }>, options: WebhooksOptions) {
  const path = options.octokit.middlewareOptions?.path || '/api/github/webhooks'
  consola.success(`🪝  Webhooks enabled: ${colors.green(`http://localhost:${options.port}${path}`)}`)

  const webhooks = createOctokitWebhooks({
    secret: options.octokit.secret,
  })

  /**
   * ref https://github.com/octokit/webhooks.js/blob/b22596fe031aa89873ba7bad0ff4329c0b882832/test/integration/node-middleware.test.ts#L73
   */
  const middleware = createNodeMiddleware(webhooks, options.octokit.middlewareOptions)
  // for post return
  app.post(path, async (ctx) => {
    const req = ctx.env.incoming
    const res = ctx.env.outgoing
    // console.log('before ctx.body', ctx.body)
    // if (await middleware(req, res)) {
    //   // ctx.header('Content-Type', '')
    //   ctx.body('ok')
    // }
    // To fix ERR_STREAM_WRITE_AFTER_END
    if (await middleware(req, res)) {
      ctx.header('Content-Length', Buffer.byteLength('ok').toString())
      return ctx.body('GitHub Webhook')
    }
  })
  return webhooks
}
