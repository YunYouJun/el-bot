import { Bot } from '../index'

export interface BotPlugin {
  /**
   * 插件信息
   */
  pkg?: {
    /**
     * 若不填写，则默认从 package.json 中读取
     * 若 package.json 中不存在，则使用文件名
     */
    name?: string
    version?: string
    description?: string
    keywords?: string[]
  }

  /**
   * 在插件加载时执行
   */
  setup: (ctx: Bot, ...options: any[]) => Promise<void> | void

  /**
   * 扩展 CLI
   */
  extendCli?: (cli: Bot['cli']) => void
}
