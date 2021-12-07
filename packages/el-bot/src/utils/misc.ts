import fs from 'fs'
import Bot from 'el-bot'
import chalk from 'chalk'

/**
 * 是否为开发模式
 */
export const isDev = process.env.NODE_ENV !== 'production'

/**
 * 休眠
 * @param ms
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 声明
 */
export function statement(ctx: Bot) {
  const pkg = ctx.el.pkg
  console.log('-----------------------------------------------')
  ctx.logger.info(`Docs: ${pkg.homepage}`)
  ctx.logger.info(`GitHub: ${pkg.repository.url}`)
  ctx.logger.info(`El-Bot Version: ${chalk.cyan(pkg.version)}`)
  console.log('-----------------------------------------------')
}

/**
 * 获取目录下的所有插件
 * @param dir
 */
export function getAllPlugins(dir: string): string[] {
  const plugins = fs.readdirSync(dir)

  return plugins.map((plugin) => {
    const extPos = plugin.lastIndexOf('.')
    if (extPos !== -1)
      return plugin.slice(0, extPos)
    else
      return plugin
  })
}
