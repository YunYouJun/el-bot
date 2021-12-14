import type { Command } from './index'

export type CommandList = Map<string, Command>

export function getHelpContent(list: CommandList) {
  let content = '帮助指令：'
  for (const [key, command] of list)
    content += `\n ${key}: ${command.desc || '没有说明'}`

  return content
}
