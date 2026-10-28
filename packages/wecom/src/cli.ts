#!/usr/bin/env node
import process from 'node:process'
import consola from 'consola'
import { config as loadDotenv } from 'dotenv'
import { WecomBridge } from './client'
import { loadWecomConfig } from './config'

function webhookTarget(value: string) {
  const url = new URL(value)
  return `${url.origin}${url.pathname}`
}

async function main() {
  loadDotenv()
  const config = await loadWecomConfig()
  const bridge = new WecomBridge({
    ...config,
    onReady: () => {
      consola.success(`WeCom long connection subscribed for bot ${config.botId}`)
      consola.info(`Forwarding inbound text to ${webhookTarget(config.webhookUrl)}`)
    },
    onInbound: payload => consola.info(`Forwarded ${payload.msg.id} (${payload.chat.type})`),
    onIgnored: ignored => consola.info(`Ignored WeCom ${ignored.msgtype} (${ignored.reason})`),
    onDisconnect: () => consola.warn('WeCom long connection closed; reconnecting'),
    onError: error => consola.error(error.message),
  })

  const shutdown = () => {
    bridge.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  consola.info('Connecting to the WeCom smart-bot long connection')
  bridge.start()
}

main().catch((error: unknown) => {
  consola.error(error instanceof Error ? error.message : 'WeCom bridge failed to start')
  process.exitCode = 1
})
