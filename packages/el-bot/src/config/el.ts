import fs from 'fs'
import { resolve } from 'path'
import type { MiraiApiHttpSetting } from 'mirai-ts'
import { mergeConfig, parseYaml } from '../utils/config'
import type { WebhookConfig } from '../bot/webhook'
import type { Target } from '../types/config'
import type { BotConfig, BotUserConfig } from './bot'

const assetsFolder = 'data/net.mamoe.mirai-api-http'

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
  analytics?: Boolean
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

const pkg = JSON.parse(fs.readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'))

export interface ElConfig<T=BotConfig> {
  /**
   * 机器人 QQ
   */
  qq: number
  /**
   * MiraiApiHttp setting.yml 路径
   * 或传入 MiraiApiHttpConfig 对象配置
   */
  setting: MiraiApiHttpSetting | string
  /**
   * mirai info
   */
  mirai: { folder: string }
  /**
   * mongodb 数据库默认配置
   */
  db: dbConfig
  /**
   * 机器人及相关插件配置
   */
  bot: T
  /**
   * webhook 配置
   */
  webhook: WebhookConfig
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
  /**
   * mirai-api-http 文件路径
   */
  path: {
    /**
     * 图片路径
     */
    image: string
    /**
     * 语音路径
     */
    voice: string
  }
}

export type ElUserConfig = Partial<ElConfig<BotUserConfig>>

/**
 * 解析 El Config
 */
export function resolveElConfig(userConfig: ElUserConfig) {
  const cwd = process.cwd()
  const miraiConfig = {
    folder: 'mcl',
  }
  const defaultElConfig: ElConfig = {
    qq: 0,
    setting: '../mcl/config/net.mamoe.mirai-api-http/setting.yml',
    mirai: miraiConfig,
    db: {
      enable: false,
    },
    bot: {
      name: 'el-bot',
      plugins: {
        default: [
          'admin',
          'answer',
          'forward',
          'limit',
          'memo',
          'rss',
          'search',
          'qrcode',
        ],
      },
      autoloadPlugins: true,
      pluginDir: 'plugins',
      master: [910426929],
      admin: [910426929],
      devGroup: 120117362,
    },
    webhook: {
      enable: true,
      port: 7777,
      path: '/webhook',
      secret: 'el-psy-congroo',
    },
    report: {
      enable: false,
    },
    base: process.cwd(),
    path: {
      image: resolve(cwd, miraiConfig.folder, `${assetsFolder}/images`),
      voice: resolve(cwd, miraiConfig.folder, `${assetsFolder}/voices`),
    },
  }

  // 合并
  const config = mergeConfig(defaultElConfig, userConfig) as ElConfig
  if (typeof config.qq === 'string')
    config.qq = parseInt(config.qq)

  config.pkg = pkg
  config.path.image = resolve(config.base, config.mirai.folder, `${assetsFolder}/images`)
  config.path.image = resolve(config.base, config.mirai.folder, `${assetsFolder}/voices`)

  // after merge
  // adapt for config path
  if (typeof config.setting === 'string') {
    config.setting = parseYaml(
      resolve(config.base!, config.setting),
    ) as MiraiApiHttpSetting
  }

  return config
}
