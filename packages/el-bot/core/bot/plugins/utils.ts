import path from 'node:path'
import consola from 'consola'

import fs from 'fs-extra'
import { BotPlugin } from './types'

/**
 * exec function to object
 * @TODO add custom options set
 */
export async function parsePluginEntry(pluginPath: string) {
  const importedCustomPlugin = (await import(pluginPath)).default
  if (typeof importedCustomPlugin === 'function') {
    return await importedCustomPlugin({})
  }
  else {
    return importedCustomPlugin
  }
}

/**
 * resolve plugin from name
 */
export async function resolvePluginFromName(options: {
  /**
   * plugin root dir
   */
  rootDir: string
  /**
   * plugin name
   */
  name: string
}) {
  const { rootDir, name } = options
  const pluginDir = path.resolve(rootDir, name)
  if (!(await fs.exists(pluginDir))) {
    consola.error(`Plugin ${name} not found`)
    return
  }

  const stat = await fs.stat(pluginDir)
  let resolvedPlugin: BotPlugin = {
    setup: () => {},
  }
  if (stat.isDirectory()) {
    const pkgPath = path.resolve(pluginDir, 'package.json')
    const entryPath = path.resolve(pluginDir, 'index.ts')
    if (!(await fs.exists(entryPath))) {
      consola.error(`Plugin ${name} entry not found`)
      return
    }
    resolvedPlugin = await parsePluginEntry(entryPath)
    if (!resolvedPlugin.pkg) {
      if (await fs.exists(pkgPath)) {
        resolvedPlugin.pkg = await import(pkgPath)
      }
      else {
        consola.warn(`Plugin ${name} package.json not found`)
      }
    }
  }
  else {
    const entryPath = path.resolve(pluginDir)
    resolvedPlugin = await parsePluginEntry(entryPath)
  }

  return resolvedPlugin
}

/**
 * 获取目录下的所有插件
 * @param dir
 */
export async function getAllPluginsFromDir(dir: string) {
  const pluginFiles = await fs.readdir(dir)

  const plugins: BotPlugin[] = []
  for (const plugin of pluginFiles) {
    const resolvedPlugin = await resolvePluginFromName({
      rootDir: dir,
      name: plugin,
    })
    if (resolvedPlugin) {
      plugins.push(resolvedPlugin)
    }
  }
  return plugins
}

export interface PluginOptions {}

/**
 * @example
 * 定义机器人插件
 * ```ts
 * import { defineBotPlugin } from 'el-bot'
 *
 * export default defineBotPlugin({
 *   pkg: {
 *     name: 'ping',
 *   },
 *   setup: (ctx) => {},
 * })
 * ```
 *
 * @example
 * 定义带配置的插件
 * ```ts
 * import { defineBotPlugin } from 'el-bot'
 *
 * export default defineBotPlugin<CustomPluginOptions>((options) => ({
 *   pkg: {
 *     name: 'ping',
 *   },
 *   setup: (ctx) => {
 *     console.log(options)
 *   }
 * })
 * ```
 */
export function defineBotPlugin<T = PluginOptions>(botPlugin: BotPlugin | ((options: T) => BotPlugin)) {
  return botPlugin as T extends PluginOptions ? (options: T) => BotPlugin : BotPlugin
}
