import type { OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'

import { Bot } from 'el-bot'

import el from '../../config/el'

@Injectable()
export class ElService implements OnModuleInit {
  /**
   * 当前 Bot
   */
  private readonly bot = new Bot(el)

  async onModuleInit() {
    await this.bot.start()
    Logger.debug('Bot start')

    // 卡片测试
    this.bot.mirai.on('message', (msg) => {
      console.log(msg)
    })
  }
}
