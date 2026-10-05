import type { Bot } from '../../../core'
import { exec } from 'node:child_process'
import consola from 'consola'
import { Argv } from 'yargs'
import { commonOptions } from '../options'

import { bindShortcut } from '../utils'

let bot: Bot

/**
 * el-bot dev .
 * @param cli
 */
export function registerDevCommand(cli: Argv) {
  cli.command(
    '* [root]',
    '启动开发模式',
    args =>
      commonOptions(args)
        .option('port', {
          alias: 'p',
          type: 'number',
          describe: 'port',
        })
        .strict()
        .help(),
    async ({ root }) => {
      const { createBot } = await import('../../../core')
      consola.start('Link Start ...')
      consola.log('')

      // set root dir
      bot = await createBot(root)
      await bot.start()

      const SHORTCUTS = [
        {
          name: 'r',
          fullName: 'restart',
          async action() {
            await bot.stop()
            await bot.start()
          },
        },
        {
          name: 'e',
          fullName: 'edit',
          action() {
            exec(`code "${root}"`)
          },
        },
      ]
      bindShortcut(SHORTCUTS)
    },
  )
}

// for vite hmr
if (import.meta.hot) {
  consola.success('[el-bot] HMR')
  const close = async () => {
    await bot?.stop()

    // hmr
    consola.success('[el-bot] HMR')
  }
  import.meta.hot.on('vite:beforeFullReload', close)
  import.meta.hot.dispose(close)
}
