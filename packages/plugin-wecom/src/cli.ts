#!/usr/bin/env node
import process from 'node:process'
import { parseArgs } from 'node:util'
import consola from 'consola'
import { config as loadDotenv } from 'dotenv'
import { WecomBridge } from './client'
import { loadWecomConfig } from './config'
import { sendWecomGroupWebhook } from './group-webhook'

async function main() {
  const { values } = parseArgs({
    options: {
      type: { type: 'string' },
      check: { type: 'boolean' },
      message: { type: 'string' },
      format: { type: 'string', default: 'text' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    consola.log(`企微机器人：pnpm wecom [--type smart|webhook] [--check]
  smart    智能机器人（长连接），只需 WECOM_BOT_ID 和 WECOM_BOT_SECRET
  webhook  群 Webhook 机器人，只需 WECOM_GROUP_WEBHOOK_URL
  --check  仅校验本地配置，不连接、不发消息
  --message <内容>  使用群 Webhook 机器人发送一条消息
  --format text|markdown  群通知格式，默认 text`)
    return
  }

  loadDotenv()
  const config = await loadWecomConfig({ botType: values.type })
  if (values.format !== 'text' && values.format !== 'markdown')
    throw new Error('--format must be text or markdown')
  if (config.botType === 'smart' && values.message !== undefined)
    throw new Error('--message is only supported by group webhook bots (--type webhook)')
  if (values.check) {
    consola.success(`WeCom config valid: ${config.botType === 'smart' ? 'smart (智能机器人 · 长连接)' : 'webhook (群 Webhook 机器人)'}`)
    return
  }
  if (config.botType === 'webhook') {
    if (!values.message?.trim())
      throw new Error('Group webhook bots only send notifications. Use --message <content> or --check')
    const message = values.format === 'markdown'
      ? { msgtype: 'markdown' as const, markdown: { content: values.message } }
      : { msgtype: 'text' as const, text: { content: values.message } }
    await sendWecomGroupWebhook({ url: config.groupWebhookUrl, message })
    consola.success('WeCom group webhook message sent')
    return
  }

  const bridge = new WecomBridge({
    ...config,
    onReady: () => {
      consola.success('WeCom smart bot long connection subscribed')
      consola.info(config.webhookUrl ? 'External webhook forwarding enabled' : 'Receiving inbound text locally')
    },
    onInbound: payload => consola.info(`${config.webhookUrl ? 'Forwarded' : 'Received'} ${payload.msg.id} (${payload.chat.type})`),
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
