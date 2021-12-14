/**
 * 面向开发者的终端
 * @packageDocumentation
 */
import type Bot from 'el-bot'
import type { MessageType } from 'mirai-ts'
import shell from 'shelljs'
import type commander from 'commander'
import { Command } from 'commander'
import type { PluginType } from '../plugins'
import { aboutInfo, cleanOptions } from './utils'

/**
 * 处理全局选项
 * @param options
 * @param ctx
 */
async function processOptions(
  program: commander.Command,
  ctx: Bot,
  msg: MessageType.ChatMessage,
) {
  const options = program.opts()

  const pkg = ctx.el.pkg

  if (options.v || options.version) {
    msg.reply(`el-bot: v${pkg.version}`)

    const mahAbout = await ctx.mirai.api.about()
    msg.reply(`mirai-api-http: v${mahAbout.data.version}`)
  }

  // about
  if (msg.plain === 'el -a' && (options.a || options.about)) {
    const about = aboutInfo(pkg)
    ctx.reply(about)
  }
}

export function initCli(ctx: Bot, name: string) {
  const { mirai } = ctx

  // modify prototype
  Command.prototype.outputHelp = function(cb: any) {
    if (!cb) {
      cb = (passthru: any) => {
        return passthru
      }
    }
    const cbOutput = cb(this.helpInformation())
    const command = (ctx.mirai.curMsg as MessageType.ChatMessage).plain.trim()
    if (
      cbOutput
      && (this.parent || command === 'el -h' || command === 'el --help')
    )
      ctx.reply(cbOutput.trim())
  }

  const cli = new Command('el')
  const program = cli
  program.exitOverride()

  // default global option
  program.option('-v', '版本').option('-a, --about', '关于')

  // 重启机器人
  program
    .command('restart')
    .description('重启 el-bot')
    .action(async() => {
      if (ctx.user.isAllowed(undefined, true)) {
        await ctx.reply('重启 el-bot')
        shell.exec('touch package.json')
      }
    })

  // 回声测试
  program
    .command('echo <message>')
    .description('回声')
    .action((message) => {
      ctx.logger.info(message)
      if (ctx.user.isAllowed(undefined, true))
        ctx.reply(message)
    })

  // 插件
  program
    .command('plugins')
    .description('插件列表')
    .option('-l, --list <type>', '插件列表', 'all')
    .action((options) => {
      let pluginsTypeArray = ['default', 'official', 'community', 'custom']

      if (options.list) {
        if (!pluginsTypeArray.concat('all').includes(options.list)) {
          ctx.reply(
            `类型不合法，应当是 ${pluginsTypeArray.concat('all')} 中的一个。`,
          )
          return
        }

        if (options.list !== 'all')
          pluginsTypeArray = [options.list]

        let content = ''
        pluginsTypeArray.forEach((type) => {
          content += ctx.plugins.list(type as PluginType)
        })

        ctx.reply(content.slice(0, -1))
      }
    })

  mirai.on('message', (msg) => {
    // qq = msg.sender.id;
    if (msg.plain.slice(0, name.length) !== name) return
    if (msg.plain[name.length] !== ' ') return

    try {
      const cmd = msg.plain.split(' ')
      cmd.shift()
      program.parse(cmd, { from: 'user' })
    }
    catch (err: any) {
      if (err && err.code !== 'commander.help' && err.exitCode) {
        ctx.logger.error(`[cli] ${msg.plain}`)
        ctx.reply(err.message)
      }
    }

    processOptions(program, ctx, msg)
    cleanOptions(program)
  })

  return program
}
