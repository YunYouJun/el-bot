import type { BotPlugin } from './types'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import consola from 'consola'

import fs from 'fs-extra'

const entryExtensions = ['.ts', '.mts', '.js', '.mjs', '.cts', '.cjs']

export function assertBotPlugin(plugin: unknown): asserts plugin is BotPlugin {
  if (!plugin || typeof plugin !== 'object' || !('setup' in plugin) || typeof plugin.setup !== 'function')
    throw new TypeError('A bot plugin must export an object with a setup(bot) function, or a factory returning that object')
}

/**
 * exec function to object
 * @TODO add custom options set
 */
export async function parsePluginEntry(pluginPath: string): Promise<BotPlugin> {
  const imported = (await import(pathToFileURL(path.resolve(pluginPath)).href)).default
  const plugin: unknown = typeof imported === 'function' ? await imported({}) : imported
  assertBotPlugin(plugin)
  return plugin
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
  let resolvedPlugin: BotPlugin
  if (stat.isDirectory()) {
    const pkgPath = path.resolve(pluginDir, 'package.json')
    let entryPath: string | undefined
    for (const extension of entryExtensions) {
      const candidate = path.join(pluginDir, `index${extension}`)
      if (await fs.pathExists(candidate)) {
        entryPath = candidate
        break
      }
    }
    if (!entryPath) {
      consola.error(`Plugin ${name} entry not found`)
      return
    }
    resolvedPlugin = await parsePluginEntry(entryPath)
    if (!resolvedPlugin.pkg && await fs.pathExists(pkgPath))
      resolvedPlugin = { ...resolvedPlugin, pkg: await fs.readJson(pkgPath) }
  }
  else if (stat.isFile() && entryExtensions.includes(path.extname(name)) && !/\.d\.[cm]?ts$/.test(name)) {
    const entryPath = path.resolve(pluginDir)
    resolvedPlugin = await parsePluginEntry(entryPath)
  }
  else {
    return
  }

  return {
    ...resolvedPlugin,
    pkg: {
      ...resolvedPlugin.pkg,
      name: resolvedPlugin.pkg?.name || (stat.isDirectory() ? name : path.basename(name, path.extname(name))),
    },
  }
}

/**
 * 获取目录下的所有插件
 * @param dir
 */
export async function getAllPluginsFromDir(dir: string) {
  let pluginFiles: string[]
  try {
    pluginFiles = await fs.readdir(dir)
  }
  catch (error) {
    consola.warn(`Unable to read plugin directory ${dir}; skipping custom plugins`, error)
    return []
  }

  const plugins: BotPlugin[] = []
  for (const name of pluginFiles.sort()) {
    if (name.startsWith('.') || name === 'node_modules')
      continue
    try {
      const resolvedPlugin = await resolvePluginFromName({ rootDir: dir, name })
      if (resolvedPlugin)
        plugins.push(resolvedPlugin)
    }
    catch (error) {
      consola.error(`Unable to load plugin ${path.join(dir, name)}; skipping it`, error)
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
export function defineBotPlugin(botPlugin: BotPlugin): BotPlugin
export function defineBotPlugin<T = PluginOptions>(botPlugin: (options: T) => BotPlugin): (options: T) => BotPlugin
export function defineBotPlugin<T = PluginOptions>(botPlugin: BotPlugin | ((options: T) => BotPlugin)) {
  return botPlugin
}
