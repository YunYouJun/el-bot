import process from 'node:process'
import { answerPlugin, defineConfig } from 'el-bot'
import { AvailableIntentsEventsEnum } from 'qq-guild-bot'

const answer = answerPlugin({
  list: [
    {
      listen: 'master',
      receivedText: ['在吗'],
      reply: 'Hello, master!',
      else: '爪巴',
    },
  ],
})

export default defineConfig({
  bot: {
    plugins: [
      answer,
    ],
  },

  server: {
    webhooks: {
      octokit: {
        secret: 'mySecret',
      },
    },
  },

  napcat: {
    debug: false,

    protocol: 'ws',
    host: '127.0.0.1',
    port: 3001,
    accessToken: '',

    // ↓ 自动重连(可选)
    reconnection: {
      enable: true,
      attempts: 10,
      delay: 5000,
    },
  },

  qq: {
    appID: process.env.QQ_BOT_APP_ID || '', // 申请机器人时获取到的机器人 BotAppID
    token: process.env.QQ_BOT_APP_TOKEN || '', // 申请机器人时获取到的机器人 BotToken
    /**
     * 事件订阅,用于开启可接收的消息类型
     * 传递了无权限的 intents，websocket 会报错
     */
    intents: [
      // @see https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/send-receive/event.html#%E5%8D%95%E8%81%8A%E6%B6%88%E6%81%AF

      // 默认权限
      AvailableIntentsEventsEnum.GUILDS,
      AvailableIntentsEventsEnum.GUILD_MEMBERS,
      AvailableIntentsEventsEnum.PUBLIC_GUILD_MESSAGES,
      // only for 私域机器人
      AvailableIntentsEventsEnum.FORUMS_EVENT,
      AvailableIntentsEventsEnum.GUILD_MESSAGES,
      AvailableIntentsEventsEnum.GUILD_MESSAGE_REACTIONS,
      AvailableIntentsEventsEnum.FORUMS_EVENT,
    ], //
    sandbox: true, // 沙箱支持，可选，默认false. v2.7.0+
  },
})
