import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import { resolve } from 'path'
import commander from 'commander'
import glob from 'glob'
import { Logger } from '@yunyoujun/logger'
import shell from 'shelljs'
import { handleError } from '../../utils/error'
// 实例目录下的 package.json
const pkg = require(getAbsolutePath('./package.json'))

const logger = new Logger({ prefix: '[cli(start)]' })

/**
 * 获取当前目录下的绝对路径
 * @param file 文件名
 */
function getAbsolutePath(file: string) {
  return resolve(process.cwd(), file)
}

export default async function(cli: commander.Command) {
  /**
   * 启动机器人
   */
  function startBot() {
    const execFile = pkg.main || 'index.js' || 'index.ts' || 'index.mjs'
    const file = getAbsolutePath(execFile)

    if (fs.existsSync(file)) {
      if (file.includes('.ts'))
        spawn('ts-node', [file], { stdio: 'inherit' })
      else
        spawn('node', [file], { stdio: 'inherit' })

      return true
    }
    else {
      logger.error(
        '不存在可执行文件，请检查 package.json 中 main 入口文件是否存在，或参考文档新建 bot/index.js 机器人实例。',
      )
      return false
    }
  }

  /**
   * 启动 MCL
   */
  function startMcl(folder?: string) {
    // 先进入目录
    try {
      shell.cd(folder || (pkg.mcl ? pkg.mcl.folder : 'mcl'))
    }
    catch (err) {
      handleError(err, logger)
      logger.error('mcl 目录不存在')
    }

    glob('./mcl', {}, (err, files) => {
      if (err)
        logger.error(err)

      if (files[0]) {
        const platform = os.platform()
        try {
          const miraiConsole = spawn(
            platform === 'win32' ? 'mcl.cmd' : './mcl',
            [],
            {
              stdio: ['pipe', 'inherit', 'inherit'],
            },
          )
          process.stdin.pipe(miraiConsole.stdin)
        }
        catch (err) {
          handleError(err, logger)
        }
      }
      else {
        logger.error(
          '请下载官方启动器 [mirai-console-loader](https://github.com/iTXTech/mirai-console-loader)。',
        )
      }
    })
  }

  // 启动
  cli
    .command('start [project]')
    .description('启动 el-bot')
    .option('-f --folder', 'mirai/mcl 所在目录')
    .action((project, options) => {
      if (!project || project === 'bot')
        startBot()
      else if (project === 'mcl')
        startMcl(options.folder)
      else
        logger.error('不存在该指令')
    })
}
