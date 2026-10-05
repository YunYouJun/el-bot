import type { InitOptions, PathOptions } from './types'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { CodexSchema } from '@el-bot/codex'
import { Command, Option } from 'commander'
import consola from 'consola'
import { readConfig } from './config'
import { readCredentials } from './credentials'
import { configureDesktop } from './desktop-setup'
import { diagnose, formatDiagnostics } from './diagnostics'
import { initialize } from './init'
import { resolvePaths } from './paths'
import { checkDesktop, checkLocal, checkQQ, instanceIdentity, startRemote } from './runtime'
import { bindInstance, StateStore } from './store'

/**
 * Register Codex operations on the unified CLI's subcommand.
 * @param program - The `el-bot codex` command to configure
 * @returns The configured command, without parsing arguments or starting a service
 */
export function registerCodexCommand(program: Command): Command {
  program.description('通过 QQ 官方机器人私聊遥控本机 Codex')
    .option('--profile <name>', '独立实例名称；隔离配置、凭据、状态与 Codex 目录')
    .option('-c, --config <path>', 'JSON 配置文件（默认 ~/.el-bot/qq-codex.json）')
    .option('--state <path>', '绑定与会话状态文件（默认 ~/.el-bot/qq-codex-state.json）')
    .option('--credentials <path>', '机器人凭据文件（默认 ~/.el-bot/qq-codex.env）')
    .addOption(new Option('--check', '兼容旧版本：仅检查本机 Codex').hideHelp().conflicts('checkQq'))
    .addOption(new Option('--check-qq', '兼容旧版本：仅检查 QQ API').hideHelp().conflicts('check'))
    .showHelpAfterError()

  program.hook('preAction', (_command, action) => {
    const legacy = program.opts<{ check?: boolean, checkQq?: boolean }>()
    if (action !== program && (legacy.check || legacy.checkQq))
      throw new Error('--check / --check-qq 仅用于无子命令的旧入口。请使用 el-bot codex check 或 el-bot codex check --qq。')
  })

  const options = (command: Command): PathOptions => {
    const opts = command.optsWithGlobals<PathOptions & { credentials?: string }>()
    return { ...opts, envFile: opts.credentials }
  }
  const credentials = (command: Command) => {
    const opts = options(command)
    return readCredentials(resolvePaths(opts).envFile, !!opts.envFile || !!opts.profile)
  }
  const config = async (command: Command) => {
    const paths = resolvePaths(options(command))
    const settings = await readConfig(paths.config)
    settings.codexHome ??= paths.codexHome
    if (settings.codexHome && settings.codexConnection === 'desktop')
      throw new Error('独立 Codex 目录需要 stdio 连接；desktop 连接沿用桌面账户，请使用独立配置 / 凭据 / 状态路径。')
    return settings
  }
  const start = async (command: Command) => {
    const paths = resolvePaths(options(command))
    await startRemote(await config(command), paths.state, await credentials(command), paths.profile)
  }
  program.command('init')
    .description('交互创建配置和凭据文件；不会覆盖已有文件或绑定')
    .option('-p, --project <directory>', '允许遥控的项目目录', process.cwd())
    .option('-n, --name <name>', 'QQ 命令使用的项目名称')
    .option('--no-prompt', '不询问凭据；使用环境变量或生成空白凭据模板')
    .action(async (opts: InitOptions, command: Command) => {
      await initialize(resolvePaths(options(command)), opts)
    })
  program.command('check')
    .description('检查配置和本机 Codex；不会启动模型任务')
    .addOption(new Option('--qq', '仅检查 QQ 鉴权和网关访问').conflicts('all'))
    .addOption(new Option('--all', '同时检查本机 Codex 与 QQ API').conflicts('qq'))
    .option('--json', '输出结构化诊断与修复建议，便于 AI 接入')
    .action(async (opts: { qq?: boolean, all?: boolean, json?: boolean }, command: Command) => {
      const report = await diagnose({
        paths: resolvePaths(options(command)),
        includeCodex: !opts.qq,
        includeQQ: !!(opts.qq || opts.all),
        loadConfig: () => config(command),
        loadCredentials: () => credentials(command),
      })
      process.stdout.write(opts.json ? `${JSON.stringify(report, null, 2)}\n` : formatDiagnostics(report))
      if (!report.ok)
        process.exitCode = 1
    })
  program.command('start')
    .description('启动遥控服务；首次启动在终端显示 QQ 私聊绑定码')
    .action(async (_opts: unknown, command: Command) => start(command))
  program.command('paths')
    .description('显示当前使用的配置、凭据和状态路径，不显示密钥')
    .action((_opts: unknown, command: Command) => {
      process.stdout.write(`${JSON.stringify(resolvePaths(options(command)), null, 2)}\n`)
    })
  program.command('recover')
    .description('重置指定项目的续聊绑定；保留主人和历史，不重放任务；先停止服务')
    .option('--project <name>', '需要新会话的项目名称；默认当前项目')
    .action(async (opts: { project?: string }, command: Command) => {
      const paths = resolvePaths(options(command))
      const settings = await config(command)
      const store = new StateStore(paths.state)
      const unlock = await store.lock()
      try {
        const state = await store.load(settings.defaultProject)
        bindInstance(state, instanceIdentity(settings, await credentials(command), paths.profile))
        if (settings.ownerOpenId && state.owner && settings.ownerOpenId !== state.owner)
          throw new Error('配置的 ownerOpenId 与已有主人绑定不同；不会重置绑定。')
        const project = opts.project ?? state.project
        if (!Object.hasOwn(settings.projects, project))
          throw new Error('未知项目；请使用配置中的项目名称。')
        await store.backupLegacy(`before-recover-${randomUUID()}`)
        delete state.threads[project]
        await store.save(state)
        consola.success(`${project}：下一条任务创建新会话。主人绑定、其他项目和历史结果保留；未启动或重放任务。`)
      }
      finally { await unlock() }
    })
  program.command('desktop-check')
    .description('只读检查 Codex Desktop 宿主工具与项目列表，不启动模型任务')
    .action(async (_opts: unknown, command: Command) => checkDesktop(await config(command)))
  program.command('desktop-init')
    .description('向已有配置接入桌面宿主；保留项目、凭据和绑定，不覆盖已有桌面配置')
    .requiredOption('--thread-id <id>', '专用的现有桌面聊天 ID')
    .option('--pipe-path <path>', '运行中桌面宿主提供的管道；默认使用 CODEX_APP_TOOLS_PIPE_PATH')
    .option('--server <path>', 'Codex 随应用提供的 server.mjs；默认从已安装缓存定位')
    .action(async (opts: { threadId: string, pipePath?: string, server?: string }, command: Command) => {
      await config(command)
      await configureDesktop(resolvePaths(options(command)).config, opts)
      consola.success('桌面配置已写入；运行 el-bot codex desktop-check 后重启遥控服务。')
    })
  program.command('api')
    .description('从本机 Codex 生成 API 目录或参数 schema，不连接机器人')
    .option('--method <name>', '查看指定方法的参数 schema')
    .option('--experimental', '同时生成实验接口')
    .option('--executable <path>', 'Codex CLI 可执行文件', 'codex')
    .action(async (opts: { method?: string, experimental?: boolean, executable: string }) => {
      const schema = await CodexSchema.load(opts.executable, opts.experimental)
      if (opts.method && !schema.methods.includes(opts.method))
        throw new Error('本机 Codex 未提供这个 API。')
      process.stdout.write(`${JSON.stringify(opts.method ? { params: schema.params(opts.method), definitions: schema.schema.definitions } : schema.methods, null, 2)}\n`)
    })
  program.action(async () => {
    const opts = program.opts<{ check?: boolean, checkQq?: boolean }>()
    if (opts.check)
      await checkLocal(await config(program), resolvePaths(options(program)).state)
    else if (opts.checkQq)
      await checkQQ(await config(program), await credentials(program))
    else
      await start(program)
  })
  return program
}

/**
 * Preserve the existing source launcher used by `pnpm qq:codex`.
 * @param argv - Codex arguments without the `el-bot codex` prefix
 * @returns Resolves after command dispatch
 */
export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  await registerCodexCommand(new Command('el-bot codex')).parseAsync(argv, { from: 'user' })
}
