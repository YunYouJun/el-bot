import { createBot } from 'el-bot'
import config from './el.config'

async function main() {
  const bot = await createBot(config)
  await bot.start()
}

main().catch(console.error)
