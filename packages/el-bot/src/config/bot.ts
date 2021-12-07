import { AnswerOptions } from '../plugins/answer'
import { ForwardOptions } from '../plugins/forward'
import { RssOptions } from '../plugins/rss'

export interface BotConfig {
  /**
   * 机器人名
   */
  name: string

  /**
   * 是否自动加载 plugins 文件夹下的自定义插件，默认目录为 ['plugins']
   */
  autoloadPlugins: boolean
  /**
   * 默认自动加载插件的目录
   */
  pluginDir: string

  /**
   * 插件配置
   */
  plugins: {
    default?: string[]
    official?: string[]
    community?: string[]
    custom?: string[]
  }
  /**
   * 主人（超级管理员）
   */
  master: number[]
  /**
   * 管理员
   */
  admin: number[]

  /**
   * 开发测试群
   */
  devGroup: number

  // 默认插件
  answer?: AnswerOptions
  forward?: ForwardOptions
  rss?: RssOptions

  /**
   * 其他插件配置
   */
  [propName: string]: any
}

export type BotUserConfig = Partial<BotConfig>
