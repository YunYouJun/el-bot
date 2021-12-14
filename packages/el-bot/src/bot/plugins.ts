import path from 'path'
import { merge } from '../utils/config'
import { isFunction } from '../shared'
import { handleError } from '../utils/error'
import type { Bot } from '.'

export type PluginInstallFunction = (ctx: Bot, ...options: any[]) => any

export interface PluginInfo {
  name?: string
  version?: string
  description?: string
  pkg?: object
}

export type Plugin = ({
  install: PluginInstallFunction
} & PluginInfo)

export type PluginType = 'default' | 'official' | 'community' | 'custom'

export const PluginTypeMap: Record<PluginType, string> = {
  default: '默认插件',
  official: '官方插件',
  community: '社区插件',
  custom: '自定义插件',
}

export class Plugins {
  default = new Set<PluginInfo>()
  official = new Set<PluginInfo>()
  community = new Set<PluginInfo>()
  custom = new Set<PluginInfo>()
  constructor(public ctx: Bot) {}

  /**
   * 根据名称判断是否为官方插件
   * @param name
   */
  isOfficial(name: string) {
    return name.startsWith('@el-bot/plugin-')
  }

  /**
   * 根据名称判断是否为社区插件
   * @param name
   */
  isCommunity(name: string) {
    return name.startsWith('el-bot-plugin-')
  }

  /**
   * 根据插件类型，获得插件标准全名或路径
   * @param name
   */
  getPluginFullName(name: string, type: PluginType) {
    let pkgName = name
    switch (type) {
      case 'default':
        pkgName = `plugins/${name}`
        break
      case 'official':
        pkgName = `@el-bot/plugin-${name}`
        break
      case 'community':
        pkgName = `el-bot-plugin-${name}`
        break
      case 'custom':
        pkgName = path.resolve(process.cwd(), name)
        break
      default:
        break
    }
    return pkgName
  }

  /**
   * 加载对应类型插件
   * @param type 插件类型 default | custom
   * @param path 所在路径
   */
  load(type: PluginType) {
    const botConfig = this.ctx.el.bot!
    if (botConfig.plugins && botConfig.plugins[type]) {
      botConfig.plugins[type]?.forEach(async(name: string) => {
        const pkgName = this.getPluginFullName(name, type)

        try {
          const pluginPath = pkgName
          const { default: plugin } = await import(type === 'default' ? path.resolve(__dirname, pluginPath) : pluginPath)

          let pkg = {
            name: pkgName,
            version: '未知',
            description: '未知',
          }
          try {
            pkg = await import(`${pluginPath}/package.json`)
          }
          catch {
            this.ctx.logger.warning(`${name} 插件没有相关描述信息`)
          }

          if (plugin) {
            if (pkg) plugin.pkg = pkg

            this[type].add({
              name: name || pkgName,
              version: plugin.version || pkg.version,
              description: plugin.description || pkg.description,
            })

            name = path.basename(name)
            this.add(name, {
              install: plugin,
            })

            this.ctx.logger.success(`[${type}] (${name}) 加载成功`)
          }
        }
        catch (err: any) {
          handleError(err as Error, this.ctx.logger)
          this.ctx.logger.error(`[${type}] (${name}) 加载失败`)
        }
      })
    }
  }

  /**
   * 是否依赖于数据库
   * @param pkg
   */
  isBasedOnDb(pkg: any): boolean {
    return pkg['el-bot'] && pkg['el-bot'].db && !this.ctx.db
  }

  /**
   * 添加插件
   * @param name 插件名
   * @param plugin 插件函数
   * @param options 默认配置
   * @param pkg 插件 package.json
   */
  add(name: string, plugin: Plugin, options?: any) {
    const ctx = this.ctx

    // 插件基于数据库，但是未启用数据库时
    if (plugin.pkg && this.isBasedOnDb(plugin.pkg)) {
      this.ctx.logger.warning(
        `[${name}] 如想要使用该插件，您须先启用数据库。`,
      )
      return
    }

    // 加载配置项
    let pluginOptions = options

    if (this.ctx.el.bot![name]) {
      if (pluginOptions)
        pluginOptions = merge(pluginOptions, this.ctx.el.bot![name])
      else
        pluginOptions = this.ctx.el.bot![name]
    }

    if (plugin && isFunction(plugin.install))
      plugin.install(ctx, pluginOptions)
  }

  /**
   * 插件列表
   * @param type 插件类型
   */
  list(type: PluginType) {
    const pluginTypeName = PluginTypeMap[type]
    let content = `无${pluginTypeName}\n`
    if (this[type].size > 0) {
      content = `${pluginTypeName}:\n`
      this[type].forEach((plugin: PluginInfo) => {
        content += `- ${plugin.name}@${plugin.version}: ${plugin.description}\n`
      })
    }
    return content
  }
}
