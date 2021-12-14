import shell from 'shelljs'
import type { Bot } from 'el-bot'

/**
 * 任务
 */
interface Job {
  name: string
  do: string[]
}

/**
 * 步骤
 */
interface Step {
  cmd: string
  async: boolean
}

/**
 * cli 配置项
 */
export interface CliOptions {
  jobs: Job[]
}

/**
 * 执行对应任务
 * @param jobs
 * @param name
 */
function doJobByName(jobs: Job[], name: string) {
  jobs.forEach((job: Job) => {
    if (job.name && job.name === name && job.do) {
      job.do.forEach((step: string | Step) => {
        let cmd = ''
        let async = false
        if (typeof step === 'string') {
          cmd = step
        }
        else {
          cmd = step.cmd
          async = step.async
        }
        if (cmd.includes('el run ')) {
          name = cmd.slice(7)
          doJobByName(jobs, name)
        }
        shell.exec(cmd, {
          async,
        })
      })
    }
  })
}

/**
 * 为 program 添加初始指令
 * @param ctx
 * @param options
 */
export function initProgram(ctx: Bot, options: CliOptions, qq: number) {
  const program = ctx.cli

  // 任务
  program
    .command('jobs')
    .description('任务列表')
    .action(async() => {
      if (!ctx.user.isAllowed(qq, true))
        return

      let content = '任务列表：'
      options.jobs.forEach((job: Job) => {
        if (job.name)
          content += `\n- ${job.name}`
      })
      ctx.reply(content)
    })

  // 自定义任务
  program
    .command('run <name>')
    .description('运行自定义任务')
    .action(async(name: string) => {
      if (!ctx.user.isAllowed(qq, true))
        return

      if (options && options.jobs && options.jobs.length > 0)
        doJobByName(options.jobs, name)
    })
}
