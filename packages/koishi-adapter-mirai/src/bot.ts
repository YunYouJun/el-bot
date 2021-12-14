import { Mirai } from 'mirai-ts'
import type { MiraiOptions } from 'mirai-ts'
import { Bot } from 'koishi'

export interface BotConfig extends Bot.BaseConfig, MiraiOptions {}

export class MiraiBot extends Bot<BotConfig> {
  $innerBot: Mirai

  constructor(adapter: WebSocketClient, app: BotConfig) {
    super(adapter, app)
    this.$innerBot = new Mirai({ app, ...adapter.config })
  }
}
