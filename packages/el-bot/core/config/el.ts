import type { MiraiApiHttpSetting } from 'mirai-ts'
import type { WebhooksOptions } from '../../node/server/webhook'
import type { BotConfig, BotUserConfig } from './bot'
import { resolve } from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'
import { NCWebsocketOptions } from 'node-napcat-ts'
import { GetWsParam } from 'qq-guild-bot'

import { Target } from '../../types'
import { mergeConfig } from '../utils/config'

export interface dbConfig {
  /**
   * 是否启用
   */
  enable: boolean
  /**
   * 数据库连接 uri
   */
  uri?: string
  /**
   * 是否进行统计分析
   */
  analytics?: boolean
}

/**
 * 上报配置
 */
export interface reportConfig {
  /**
   * 是否启用
   */
  enable: boolean
  /**
   * 上报对象
   */
  target?: Target
}

const packagePath = resolve(process.cwd(), 'package.json')
const pkg = fs.existsSync(packagePath) ? fs.readJsonSync(packagePath) : {}

export interface BotServerOptions {
  /**
   * @default 7777
   */
  port?: number
  /**
   * webhook 配置
   * - github by octokit
   */
  webhooks: WebhooksOptions
}

export interface ElConfig<T = BotConfig> {
  /**
   * 开启调试模式
   */
  debug?: boolean
  /**
   * mongodb 数据库默认配置
   */
  db: dbConfig
  /**
   * 机器人及相关插件配置
   */
  bot: T
  /**
   * node-napcat-ts 配置
   * @see https://github.com/huankong233/node-napcat-ts
   * @see https://blog.huankong.top/docs/node-napcat-ts/
   */
  napcat: NCWebsocketOptions & {
    debug?: boolean
  }
  /**
   * qq-guild-bot 配置
   * GetWsParam
   * @see https://bot.q.qq.com/wiki/develop/nodesdk/#%E4%BD%BF%E7%94%A8%E7%A4%BA%E4%BE%8B
   * @see indents https://bot.q.qq.com/wiki/develop/api/gateway/intents.html#%E4%BA%8B%E4%BB%B6%E8%AE%A2%E9%98%85-intents
   */
  qq?: GetWsParam
  mirai?: { qq: number, setting?: Partial<MiraiApiHttpSetting> }

  /**
   * 服务器配置
   * based on hono
   */
  server: BotServerOptions
  /**
   * 上报错误信息配置
   */
  report: reportConfig
  /**
   * 用户的 package.json
   */
  pkg?: any
  /**
   * 根目录
   */
  base: string
}

export type ElUserConfig = Partial<ElConfig<BotUserConfig>>

/**
 * 解析 El Config
 */
export function resolveElConfig(userConfig: ElUserConfig) {
  const defaultElConfig: ElConfig = {
    db: {
      enable: false,
    },
    napcat: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 3001,
      accessToken: '',
    },
    bot: {
      name: 'el-bot',
      plugins: [],
      // default: [
      //   'admin',
      //   'answer',
      //   'forward',
      //   'limit',
      //   'memo',
      //   'rss',
      //   'search',
      //   'qrcode',
      // ],
      autoloadPlugins: true,
      pluginDir: 'bot/plugins',
      master: [910426929],
      admin: [910426929],
      devGroup: 120117362,
    },
    server: {
      webhooks: {
        enable: true,
        port: 7777,
        octokit: {
          secret: 'el-psy-congroo',
          middlewareOptions: {},
        },
      },
    },
    report: {
      enable: false,
    },
    base: process.cwd(),
  }

  // 合并
  const config = mergeConfig(defaultElConfig, userConfig) as ElConfig
  config.pkg = pkg

  return config
}
