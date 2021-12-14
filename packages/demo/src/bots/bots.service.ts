import type { OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'
import type { El } from 'el-bot'
import { Bot } from 'el-bot'

import el from '../config/el'

@Injectable()
export class BotsService implements OnModuleInit {
  /**
   * 当前 Bot
   */
  private readonly bot = new Bot(el)
  private readonly bots: Bot[] = []

  async onModuleInit() {
    await this.bot.start()
    Logger.debug('Bot start')

    // 卡片测试
    this.bot.mirai.on('message', (msg) => {
      console.log(msg)
    })
  }

  create(el: El) {
    const bot = new Bot(el)
    this.bots.push(bot)
  }

  findAll(): Bot[] {
    return this.bots
  }
}
