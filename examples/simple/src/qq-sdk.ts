import process from 'node:process'
import consola from 'consola'
import { QQBotClient, QQGateway } from 'qq-sdk'
import 'dotenv/config'

export async function main() {
  const client = new QQBotClient({ appId: process.env.QQ_BOT_APP_ID ?? '', secret: process.env.QQ_BOT_SECRET ?? '' })
  const gateway = new QQGateway(client, {
    onError: error => consola.error(error.message),
    onReady: () => consola.success('QQ connected'),
    onMessage: async (message) => {
      await client.reply(message.author.user_openid, message.id, 'Hello from el-bot!', 1)
    },
  })
  await gateway.start()
  process.once('SIGINT', () => gateway.stop())
}
