import type { WecomGrokBinding } from './runtime'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { GrokWebhookResponder } from '@el-bot/plugin-grok'
import { loadWecomConfig } from '@el-bot/plugin-wecom'
import { serve } from '@hono/node-server'
import consola from 'consola'
import { config as loadDotenv } from 'dotenv'
import { waitForPublicCallback } from './callback'
import { startWecomGrok } from './runtime'

async function main() {
  loadDotenv({ quiet: true })
  const wecom = await loadWecomConfig()
  if (wecom.botType !== 'smart')
    throw new Error('WeCom Grok question answering requires a smart bot')
  const configPath = resolve(process.env.WECOM_GROK_CONFIG ?? '.el-bot/wecom-grok/config.json')
  const value: unknown = JSON.parse(await readFile(configPath, 'utf8'))
  if (typeof value !== 'object' || value === null || !('wecomBotId' in value) || !('ownerUserId' in value)
    || typeof value.wecomBotId !== 'string' || typeof value.ownerUserId !== 'string') {
    throw new Error('Invalid local WeCom Grok binding')
  }
  const binding: WecomGrokBinding = { wecomBotId: value.wecomBotId, ownerUserId: value.ownerUserId }
  if (binding.wecomBotId !== wecom.botId || !binding.ownerUserId.trim())
    throw new Error('The binding must use this bot and a verified SDK userid')
  const port = Number(process.env.GROK_BOT_CALLBACK_PORT ?? 8789)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid callback port')
  const hostname = process.env.GROK_BOT_CALLBACK_HOST ?? '127.0.0.1'
  if (hostname !== '127.0.0.1' && hostname !== '0.0.0.0')
    throw new Error('Callback host must be loopback or a container listener')
  const responder = new GrokWebhookResponder({
    webhookUrl: process.env.GROK_BOT_WEBHOOK_URL ?? wecom.webhookUrl ?? '',
    authValue: process.env.GROK_BOT_WEBHOOK_AUTH_VALUE ?? wecom.webhookAuthValue ?? '',
    authHeader: process.env.GROK_BOT_WEBHOOK_AUTH_HEADER ?? wecom.webhookAuthHeader,
    callbackUrl: process.env.GROK_BOT_CALLBACK_URL ?? '',
    onSent: () => consola.info(JSON.stringify({ event: 'grok-accepted' })),
  })
  if (process.argv.includes('--check')) {
    consola.success('WeCom Grok configuration valid; no connections or messages')
    return
  }
  const instanceId = randomUUID()
  const server = serve({
    async fetch(request) {
      const response = await responder.handleRequest(request)
      response.headers.set('x-el-bot-instance', instanceId)
      return response
    },
    hostname,
    port,
  })
  const control = new AbortController()
  let app: Awaited<ReturnType<typeof startWecomGrok>>
  try {
    await once(server, 'listening')
    await waitForPublicCallback({ url: process.env.GROK_BOT_CALLBACK_URL!, instanceId })
    app = await startWecomGrok({
      wecom,
      binding,
      responder,
      signal: control.signal,
      onEvent: (event, code) => consola.info(JSON.stringify({ time: new Date().toISOString(), event, ...(code ? { code } : {}) })),
    })
  }
  catch (error) {
    server.close()
    throw error
  }
  const shutdown = () => {
    control.abort()
    server.close()
    void app.stop().then(() => {
      process.removeListener('SIGINT', shutdown)
      process.removeListener('SIGTERM', shutdown)
      consola.info('WeCom Grok question-answering connection closed')
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    consola.error('WeCom Grok startup failed; check local binding, official webhook and callback configuration')
    process.exitCode = 1
  })
}
