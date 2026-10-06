import type { NapcatMessage } from '../../composition-api'
import type { Command } from './index'

export type CommandList = Map<string, Command>
export const helpNames = new Set(['帮助', 'help'])

export function getHelpContent(list: CommandList, name?: string) {
  if (name !== undefined) {
    if (helpNames.has(name))
      return '帮助 / help：查看命令帮助\n用法：帮助 [命令名]\n示例：帮助 answer'
    const command = list.get(name)
    if (!command)
      return `未找到命令「${name}」。发送「帮助」查看命令列表。`
    const lines = [
      `${command.name}：${command.desc || '没有说明'}`,
      `用法：${command.usageText || command.name}`,
    ]
    if (command.examples.length)
      lines.push('示例：', ...command.examples.map(example => `  ${example}`))
    return lines.join('\n')
  }

  const lines = ['帮助指令：', '  帮助 / help [命令名]：查看命令帮助']
  for (const [key, command] of list)
    lines.push(`  ${key}：${command.desc || '没有说明'}`)
  lines.push('发送「帮助 命令名」查看用法与示例。群聊请在开头 @机器人或加上机器人名。')
  return lines.join('\n')
}

/** Read structured segments so CQ-like text cannot impersonate an @ mention. */
export function getCommandText(message: NapcatMessage, botName: string, commands: CommandList): string | undefined {
  if (message.sender.user_id === message.self_id)
    return undefined
  let text = ''
  let mentioned = false
  for (const segment of message.message) {
    if (segment.type === 'text') {
      text += segment.data.text
    }
    else if (segment.type === 'at' && !text.trim() && !mentioned && segment.data.qq === String(message.self_id)) {
      mentioned = true
    }
    else {
      // Media and other mentions remain available to the existing message hooks.
      return undefined
    }
  }
  text = text.trim()
  const prefix = botName.trim()
  const named = prefix && text.startsWith(prefix) && /\s/u.test(text.charAt(prefix.length))
  const first = text.split(/\s+/u)[0]
  const direct = message.message_type === 'private' && (helpNames.has(first) || commands.has(first))
  if (named && !direct)
    text = text.slice(prefix.length).trim()
  if (message.message_type === 'group' && !mentioned && !named)
    return undefined
  return text
}
