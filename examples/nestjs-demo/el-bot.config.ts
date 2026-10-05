import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { defineConfig } from 'el-bot'
import botConfig from './config/bot'

dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
})

export default defineConfig({
  mirai: { qq: Number(process.env.BOT_QQ), setting: { verifyKey: process.env.MIRAI_VERIFY_KEY } },
  db: {
    enable: process.env.EL_DB_ENABLE === 'true',
    uri: process.env.BOT_DB_URI,
    analytics: true,
  },
  bot: botConfig,
  server: {
    port: 7777,
    webhooks: {
      enable: Boolean(process.env.GITHUB_WEBHOOK_SECRET),
      octokit: { secret: process.env.GITHUB_WEBHOOK_SECRET ?? '', middlewareOptions: { path: '/webhook' } },
    },
  },
})
