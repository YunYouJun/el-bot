/* eslint-disable no-console */
// import { Bot } from 'el-bot'

// const bot = new Bot({})
// bot.start()

import process from 'node:process'

import axios from 'axios'
import consola from 'consola'

import { AvailableIntentsEventsEnum, createOpenAPI, createWebsocket, GetWsParam } from 'qq-guild-bot'

import { DOMAINS, QQAvailableIntentsEvents } from 'qq-sdk'
import 'dotenv/config'

/**
 * websocket 事件推送链路将在24年年底前逐步下线，后续官方不再维护。已接入websocket链路的机器人，请迁移至webhook链路
 * @see https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html#webhook%E6%96%B9%E5%BC%8F
 */

export const testConfig: GetWsParam = {
  appID: process.env.QQ_BOT_APP_ID || '', // 申请机器人时获取到的机器人 BotAppID
  token: process.env.QQ_BOT_APP_TOKEN || '', // 申请机器人时获取到的机器人 BotToken
  intents: [
    QQAvailableIntentsEvents.GROUP_AT_MESSAGE_CREATE,
    AvailableIntentsEventsEnum.PUBLIC_GUILD_MESSAGES,
  ], // 事件订阅,用于开启可接收的消息类型
  sandbox: true, // 沙箱支持，可选，默认false. v2.7.0+
}

export async function main() {
  // 创建 client
  const client = createOpenAPI(testConfig)
  // client.messageApi
  //   .postMessage('120117362', {
  //     content: 'Hello, World!',
  //   })
  //   .catch((err) => {
  //     // err信息错误码请参考API文档错误码描述
  //     console.log(err)
  //   })

  // // 创建 websocket 连接
  const ws = createWebsocket(testConfig)
  // ws.connect(testConfig)
  // // ws.on('PUBLIC_GUILD_MESSAGES', (data) => {
  // //   console.log('[PUBLIC_GUILD_MESSAGES] 事件接收 :', data)
  // // })

  consola.debug(
    process.env.QQ_BOT_APP_ID,
    process.env.QQ_BOT_APP_TOKEN,
  )

  // const data = await getAppAccessToken({
  //   appId: process.env.QQ_BOT_APP_ID || '',
  //   clientSecret: process.env.QQ_BOT_APP_TOKEN || '',
  // })

  // const ylfGuildID = 'a79w1pvk63'
  // const ylfTestGuildID = '8608jr6og1'

  // const { data } = await client.meApi.me()
  // console.log(data)

  // await client.meApi.meGuilds({}).then((res) => {
  //   console.log(res.data)
  // })

  // client.messageApi
  //   .postMessage(ylfChannelID, {
  //     content: 'messageApi接口触发：hello',
  //   })
  //   .then((res) => {
  //   // 数据存储在data中
  //     console.log(res.data)
  //   })
  //   .catch((err) => {
  //   // err信息错误码请参考API文档错误码描述
  //     console.log(err)
  //   })

  // 测试群
  const groupId = 120117362

  setTimeout(async () => {
    try {
      const { data } = await axios.post(`${DOMAINS.SANDBOX}/v2/groups/${groupId}/messages`, {
        content: 'Hello, World!',
        msg_type: 0,
      }, {
        headers: {
          Authorization: `QQBot ${process.env.QQ_BOT_APP_TOKEN}`,
        },
      })
      consola.info('messages:', data)
    }
    catch (e) {
      consola.error(e)
    }
  }, 3000)

  ws.on('READY', (wsdata) => {
    console.log('[READY] 事件接收 :', wsdata)
  })
  ws.on('ERROR', (data) => {
    console.log('[ERROR] 事件接收 :', data)
  })
  ws.on('GUILDS', (data) => {
    console.log('[GUILDS] 事件接收 :', data)
  })
  ws.on('GUILD_MEMBERS', (data) => {
    console.log('[GUILD_MEMBERS] 事件接收 :', data)
  })
  ws.on('GUILD_MESSAGES', (data) => {
    console.log('[GUILD_MESSAGES] 事件接收 :', data)
  })
  ws.on('GUILD_MESSAGE_REACTIONS', (data) => {
    console.log('[GUILD_MESSAGE_REACTIONS] 事件接收 :', data)
  })
  ws.on('DIRECT_MESSAGE', (data) => {
    console.log('[DIRECT_MESSAGE] 事件接收 :', data)
  })
  ws.on('INTERACTION', (data) => {
    console.log('[INTERACTION] 事件接收 :', data)
  })
  ws.on('MESSAGE_AUDIT', (data) => {
    console.log('[MESSAGE_AUDIT] 事件接收 :', data)
  })
  ws.on('FORUMS_EVENT', (data) => {
    console.log('[FORUMS_EVENT] 事件接收 :', data)
  })
  ws.on('AUDIO_ACTION', (data) => {
    console.log('[AUDIO_ACTION] 事件接收 :', data)
  })
  ws.on('PUBLIC_GUILD_MESSAGES', (data) => {
    console.log('[PUBLIC_GUILD_MESSAGES] 事件接收 :', data)
  })

  return {
    client,
    ws,
  }
}

main()
