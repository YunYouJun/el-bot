import { Adapter, Logger } from 'koishi'
// import type { MessageType } from 'mirai-ts'
import type { BotConfig, MiraiBot } from './bot'

const logger = new Logger('mirai')

// const createSession = (bot: MiraiBot, msg: MessageType.ChatMessage) => {
//   // todo
// }

export class WebSocketClient extends Adapter<BotConfig> {
  async connect(bot: MiraiBot) {
    console.log(bot)
  // const mirai = bot.$innerBot
  // await mirai.link()
  // mirai.on('message', (msg) => {
  //   const session = createSession(bot, msg)
  //   if (session) this.dispatch(session)
  // })
  }

  start() {}

  stop() {
    logger.debug('ws server closing')
  }
}
