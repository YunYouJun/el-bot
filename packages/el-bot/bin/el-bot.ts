#!/usr/bin/env node

import process from 'node:process'
import { registerCodexCommand } from '@el-bot/qq-codex/cli'
import { Command } from 'commander'
import consola from 'consola'
import { runLegacy } from '../node/cli/legacy'
import { version } from '../package.json'

const program = new Command('el-bot')
  .description('el-bot 机器人与 Codex 遥控工具')
  .version(version, '-v, --version')
  .showHelpAfterError()

registerCodexCommand(program.command('codex'))

program.command('dev [root]')
  .description('启动机器人开发模式')
  .option('-p, --port <port>', '服务端口')
  .action(async (root: string | undefined, options: { port?: string }) => {
    await runLegacy([root ?? '.', ...(options.port ? ['--port', options.port] : [])])
  })

// Preserve the original `el-bot [root] [options]` launcher.
program.allowUnknownOption().allowExcessArguments().action(async () => runLegacy(process.argv.slice(2)))

program.parseAsync().catch((error: unknown) => {
  consola.error(error instanceof Error ? error.message : 'el-bot 启动失败')
  process.exitCode = 1
})
