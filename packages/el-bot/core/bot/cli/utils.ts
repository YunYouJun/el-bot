import type { Command as CliCommand } from 'commander'

/**
 * 返回关于信息
 */
export function aboutInfo(pkg: any) {
  let about = ''
  about += `GitHub: ${pkg.repository.url}\n`
  about += `Docs: ${pkg.homepage}\n`
  about += `SDK: ${pkg.directories.lib}\n`
  about += 'Author: ' + `${pkg.author.name} <${pkg.author.url}>` + '\n'
  about += 'Copyright: @ElpsyCN'
  return about
}

/**
 * 清理全局选项
 */
export function cleanOptions(program: CliCommand) {
  for (const option of program.options)
    program.setOptionValue(option.attributeName(), option.defaultValue)
  for (const command of program.commands)
    cleanOptions(command)
}
