import type { CliPaths, InitOptions } from './types'
import { existsSync } from 'node:fs'
import { mkdir, realpath, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import process from 'node:process'
import consola from 'consola'
import enquirer from 'enquirer'

/** Create first-run files without overwriting credentials, configuration or pairing state. */
export async function initialize(paths: CliPaths, options: InitOptions): Promise<void> {
  if (existsSync(paths.config))
    throw new Error(`配置已存在：${paths.config}。请直接编辑此文件，不会覆盖已有项目或绑定。`)
  const project = await realpath(resolve(options.project ?? process.cwd()))
  if (!(await stat(project)).isDirectory())
    throw new Error('项目路径必须是一个已有目录。')
  const name = options.name ?? (basename(project).replace(/[^\w-]/g, '-').slice(0, 64) || 'project')
  if (!/^[\w-]{1,64}$/.test(name))
    throw new Error('项目名称只能使用 1–64 个字母、数字、下划线或连字符。')
  if (new Set([paths.config, paths.envFile, paths.state]).size !== 3)
    throw new Error('配置、凭据和状态必须使用不同的文件路径。')
  const hasEnv = existsSync(paths.envFile)
  let appId = process.env.QQ_BOT_APP_ID ?? ''
  let secret = process.env.QQ_BOT_SECRET ?? process.env.QQ_BOT_APP_SECRET ?? ''
  if (!hasEnv && options.prompt && process.stdin.isTTY) {
    const questions = []
    if (!appId)
      questions.push({ type: 'input', name: 'appId', message: 'QQ 机器人 AppID', validate: (value: string) => !!value.trim() || '请输入 AppID' })
    if (!secret)
      questions.push({ type: 'password', name: 'secret', message: 'QQ 机器人 AppSecret（隐藏输入）', validate: (value: string) => !!value.trim() || '请输入 AppSecret' })
    try {
      const answers = await enquirer.prompt<{ appId?: string, secret?: string }>(questions)
      appId ||= answers.appId?.trim() ?? ''
      secret ||= answers.secret?.trim() ?? ''
    }
    catch {
      throw new Error('初始化已取消，未写入配置。')
    }
  }
  if (!hasEnv && /[\r\n\0"'`\\]/.test(appId + secret))
    throw new Error('AppID 和 AppSecret 不能包含换行、引号或反斜杠。')
  const created: string[] = []
  try {
    for (const filename of [paths.config, paths.envFile])
      await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
    if (paths.codexHome)
      await mkdir(paths.codexHome, { recursive: true, mode: 0o700 })
    if (!hasEnv) {
      await writeFile(paths.envFile, `# QQ official bot credentials. Keep this file private.\nQQ_BOT_APP_ID="${appId}"\nQQ_BOT_SECRET="${secret}"\n`, { flag: 'wx', mode: 0o600 })
      created.push(paths.envFile)
    }
    await writeFile(paths.config, `${JSON.stringify({ projects: { [name]: project }, defaultProject: name, ...(paths.codexHome ? { codexHome: paths.codexHome } : {}), transport: 'websocket', sandbox: false, messageFormat: 'markdown' }, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    created.push(paths.config)
  }
  catch (error) {
    await Promise.all(created.map(filename => unlink(filename)))
    throw error
  }
  consola.success(`配置已创建：${paths.config}`)
  consola.info(`凭据文件：${paths.envFile}${hasEnv ? '（沿用现有文件）' : ''}`)
  if (!hasEnv && (!appId || !secret))
    consola.info('请在凭据文件中补齐 AppID 和 AppSecret。')
  consola.info('在 QQ 后台启用 WebSocket，并配置运行机器的出口 IP 白名单。')
  consola.info('接下来运行 el-bot codex check --all，然后运行 el-bot codex start。自定义路径请沿用 --config / --credentials / --state。')
  if (paths.profile)
    consola.info(`后续命令沿用 --profile ${paths.profile}；Codex 账户与会话目录：${paths.codexHome}。先设置 CODEX_HOME 为该目录，再在本机运行 codex login。不会复制已有账户密钥。`)
}
