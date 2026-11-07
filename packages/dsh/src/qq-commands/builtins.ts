import type { QQCommandInfo } from './registry'
import { QQCommandRegistry } from './registry'

/** Version-pinned commands registered by dsh-qqbot 0.5.5 and delegated to its own middleware. */
export const DOWNSTREAM_COMMANDS: readonly QQCommandInfo[] = [
  { name: 'new', aliases: ['reset', 'clear'], description: '开始一个全新的会话', usage: 'new', examples: [], scope: 'c2c', permission: 'owner', hidden: false },
  { name: 'compact', aliases: [], description: '压缩当前会话上下文', usage: 'compact', examples: [], scope: 'c2c', permission: 'owner', hidden: false },
  { name: 'model', aliases: [], description: '查看或切换当前模型', usage: 'model [模型]', examples: [], scope: 'c2c', permission: 'owner', hidden: false },
  { name: 'preset', aliases: [], description: '查看或切换当前预设', usage: 'preset [预设]', examples: [], scope: 'c2c', permission: 'owner', hidden: false },
  { name: 'stop', aliases: [], description: '中止当前生成', usage: 'stop', examples: [], scope: 'c2c', permission: 'owner', hidden: false },
  { name: 'bot-help', aliases: [], description: '查看 dsh-qqbot 内置指令', usage: 'bot-help', examples: [], scope: 'c2c', permission: 'owner', hidden: false },
  { name: 'bot-ping', aliases: [], description: '测试 QQ 连接延迟', usage: 'bot-ping', examples: [], scope: 'c2c', permission: 'owner', hidden: false },
  { name: 'bot-version', aliases: [], description: '查看 dsh-qqbot 版本与模型', usage: 'bot-version', examples: [], scope: 'c2c', permission: 'owner', hidden: false },
  { name: 'bot-me', aliases: [], description: '查看你的 OpenID', usage: 'bot-me', examples: [], scope: 'c2c', permission: 'owner', hidden: false },
  { name: 'bot-status', aliases: [], description: '查看当前 QQ 会话状态', usage: 'bot-status', examples: [], scope: 'c2c', permission: 'owner', hidden: false },
]

export const DOWNSTREAM_COMMAND_NAMES = new Set(DOWNSTREAM_COMMANDS.flatMap(command => [command.name, ...command.aliases]))

export interface BuiltinQQCommandOptions {
  /** Owner-only restart of the supervised cloud process. */
  restart?: (force: boolean, reply: (text: string) => Promise<void>) => Promise<void>
}

/** Register el-bot answers before dsh-qqbot sees the same message. */
export function registerBuiltinQQCommands(registry: QQCommandRegistry, options: BuiltinQQCommandOptions = {}) {
  registry.command('help')
    .description('查看全部指令或单个指令的用法')
    .usage('help [指令]')
    .example('help')
    .example('help ping')
    .scope('c2c')
    .permission('owner')
    .action(args => ({
      markdown: registry.helpMarkdown(args[0]),
      text: registry.help(args[0]),
    }))

  registry.command('ping')
    .description('测试小云是否在线')
    .usage('ping')
    .example('ping')
    .scope('c2c')
    .permission('owner')
    .action(() => 'pong')

  if (options.restart) {
    registry.command('restart')
      .description('重启小云云端服务，由容器自动拉起')
      .usage('restart [force]')
      .example('restart')
      .example('restart force')
      .scope('c2c')
      .permission('owner')
      .action(async (args, context) => {
        const force = args.length === 1 && ['force', '--force'].includes(args[0]!.toLowerCase())
        if (args.length > 1 || (args.length === 1 && !force))
          return '用法：/restart [force]'
        await options.restart!(force, context.reply)
      })
  }
}
