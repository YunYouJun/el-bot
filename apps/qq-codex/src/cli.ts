import type { InitOptions, PathOptions } from './types'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { CodexSchema } from '@el-bot/codex'
import { Command, Option } from 'commander'
import consola from 'consola'
import { helpCard, resultCard, statusCard } from './cards'
import { readConfig } from './config'
import { runtimeLogs, runtimeStatus, startBackground, stopBackground } from './control'
import { readCredentials } from './credentials'
import { configureDesktop } from './desktop-setup'
import { diagnose, formatDiagnostics } from './diagnostics'
import { closeCardRenderer, renderCardImage } from './image'
import { initialize } from './init'
import { resolvePaths } from './paths'
import { replyPreferences } from './preferences'
import { checkDesktop, checkLocal, checkQQ, instanceIdentity, startRemote } from './runtime'
import { bindInstance, StateStore } from './store'

/**
 * Register Codex operations on the unified CLI's subcommand.
 * @param program - The `el-bot codex` command to configure
 * @returns The configured command, without parsing arguments or starting a service
 */
export function registerCodexCommand(program: Command): Command {
  program.description('通过 QQ 官方机器人私聊遥控 Codex、CodeBuddy 或 dsh')
    .option('--profile <name>', '独立实例名称；隔离配置、QQ 凭据和状态（Codex 另隔离账户目录）')
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
    if (!settings.agent || settings.agent === 'codex')
      settings.codexHome ??= paths.codexHome
    if (settings.codexHome && settings.codexConnection === 'desktop')
      throw new Error('独立 Codex 目录需要 stdio 连接；desktop 连接沿用桌面账户，请使用独立配置 / 凭据 / 状态路径。')
    return settings
  }
  const start = async (command: Command) => {
    const paths = resolvePaths(options(command))
    await startRemote(await config(command), paths.state, await credentials(command), paths.profile)
  }
  const managed = async (json: boolean | undefined, operation: () => Promise<unknown>) => {
    try {
      const result = await operation()
      process.stdout.write(`${JSON.stringify({ ok: true, result }, null, json ? undefined : 2)}\n`)
    }
    catch (error) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : '本机控制失败。' })}\n`)
      process.exitCode = 1
    }
  }
  program.command('init')
    .description('交互创建配置和凭据文件；不会覆盖已有文件或绑定')
    .addOption(new Option('--agent <name>', '本机任务程序').choices(['codex', 'codebuddy', 'dsh']).default('codex'))
    .option('-p, --project <directory>', '允许遥控的项目目录', process.cwd())
    .option('-n, --name <name>', 'QQ 命令使用的项目名称')
    .option('--no-prompt', '不询问凭据；使用环境变量或生成空白凭据模板')
    .action(async (opts: InitOptions, command: Command) => {
      await initialize(resolvePaths(options(command)), opts)
    })
  program.command('check')
    .description('检查配置和当前本机程序；不会启动模型任务')
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
    .option('--background', '独立后台运行；日志写入状态文件旁的 .log')
    .option('--json', '输出本机控制结果；需要 --background')
    .action(async (opts: { background?: boolean, json?: boolean }, command: Command) => {
      if (opts.background) {
        await managed(opts.json, async () => {
          await config(command)
          await credentials(command)
          return startBackground(resolvePaths(options(command)))
        })
      }
      else if (opts.json) {
        await managed(true, async () => {
          throw new Error('--json 启动需要 --background。')
        })
      }
      else {
        await start(command)
      }
    })
  for (const operation of ['status', 'stop', 'restart', 'logs'] as const) {
    const command = program.command(operation).description({ status: '查看经过身份校验的本机运行状态', stop: '正常停止；有任务时默认拒绝', restart: '正常停止后重新后台启动', logs: '查看最近的本机后台日志' }[operation]).option('--json', '输出结构化控制结果')
    if (operation === 'stop' || operation === 'restart')
      command.option('--interrupt', '明确中断执行中任务并关闭服务')
    command.action(async (opts: { json?: boolean, interrupt?: boolean }, action: Command) => managed(opts.json, async () => {
      const paths = resolvePaths(options(action))
      if (operation === 'status')
        return runtimeStatus(paths.state)
      if (operation === 'logs')
        return runtimeLogs(paths.state)
      if (operation === 'stop')
        return stopBackground(paths.state, opts.interrupt)
      await config(action)
      await credentials(action)
      await stopBackground(paths.state, opts.interrupt)
      return startBackground(paths)
    }))
  }
  program.command('preferences')
    .description('查看或保存回复格式与图片主题；修改后重启生效，不自动中断任务')
    .addOption(new Option('--message-format <format>', 'QQ 回复格式').choices(['image', 'markdown', 'text']))
    .addOption(new Option('--image-theme <theme>', '图片卡片主题').choices(['light', 'dark']))
    .option('--json', '输出结构化设置，不显示其他配置或凭据')
    .action(async (opts: { json?: boolean, messageFormat?: 'image' | 'markdown' | 'text', imageTheme?: 'light' | 'dark' }, command: Command) => managed(opts.json, async () => {
      const paths = resolvePaths(options(command))
      return replyPreferences(paths.config, paths.state, { messageFormat: opts.messageFormat, imageTheme: opts.imageTheme })
    }))
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
  program.command('browser-install')
    .description('安装当前 el-bot 依赖版本对应的 Chromium；仅图片模式需要')
    .option('--with-deps', '同时安装浏览器系统依赖；Linux 上可能需要管理员权限')
    .action(async (opts: { withDeps?: boolean }) => {
      const cli = join(dirname(createRequire(import.meta.url).resolve('playwright/package.json')), 'cli.js')
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, [cli, 'install', 'chromium', ...opts.withDeps ? ['--with-deps'] : []], { stdio: 'inherit' })
        child.once('error', reject)
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Chromium 安装失败（退出码 ${code}）`)))
      })
    })
  program.command('render')
    .description('生成本地卡片 PNG 预览；不连接 QQ、不运行模型、不覆盖已有图片')
    .requiredOption('-o, --output <file>', '输出 PNG 路径')
    .addOption(new Option('--card <type>', '预览卡片类型').choices(['status', 'result', 'help']).default('status'))
    .addOption(new Option('--theme <name>', '图片主题').choices(['light', 'dark']).default('light'))
    .option('--text-file <file>', '读取 UTF-8 结果文字；仅配合 result')
    .option('--font-file <file>', '额外加载本机字体文件')
    .option('--font-family <name>', '字体族名称')
    .option('--page <number>', '帮助分类或结果页码', '1')
    .option('--part <number>', '图片帮助的分类内页码；仅配合 help', '1')
    .action(async (opts: { output: string, card: string, theme: 'light' | 'dark', textFile?: string, fontFile?: string, fontFamily?: string, page: string, part: string }) => {
      if (opts.textFile && opts.card !== 'result')
        throw new Error('--text-file 仅用于 result 卡片')
      if (opts.card !== 'help' && opts.part !== '1')
        throw new Error('--part 仅用于 help 卡片')
      const output = opts.textFile ? await readFile(resolve(opts.textFile), 'utf8') : '图片展示已启用。\n中文、代码与操作指令保持原文。\nconst status = "completed"'
      if (output.length > 100000)
        throw new Error('预览结果最多 100000 个字符')
      const page = Number(opts.page)
      const card = opts.card === 'help' ? helpCard('demo', page, 'preview', undefined, { image: true, part: Number(opts.part) }) : opts.card === 'result' ? resultCard({ id: 'preview', project: 'demo', status: 'completed', output, createdAt: new Date().toISOString() }, page, 'preview') : statusCard('demo', { id: 'preview', project: 'demo', status: 'running', output: '', createdAt: new Date().toISOString() }, [], page, 'preview')
      if (!card)
        throw new Error('卡片页码无效')
      try {
        const image = await renderCardImage(card, { theme: opts.theme, ...(opts.fontFile ? { fontFiles: [resolve(opts.fontFile)] } : {}), fontFamily: opts.fontFamily })
        await writeFile(resolve(opts.output), image.png, { flag: 'wx', mode: 0o600 })
        consola.success(`已生成 ${image.width}×${image.height} PNG：${resolve(opts.output)}。未发送 QQ 消息。`)
      }
      finally { await closeCardRenderer() }
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
