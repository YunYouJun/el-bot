import type { BotCredentials, DiagnosticCheck, DiagnosticOptions, DiagnosticReport, RemoteConfig, RemoteState } from './types'
import process from 'node:process'
import { CodexDesktopClient, CodexSchema } from '@el-bot/codex'
import { QQApiError, QQBotClient } from 'qq-sdk/official'
import { failureCode } from './failures'
import { checkCodexReadiness } from './readiness'
import { createCodexClient, instanceIdentity } from './runtime'
import { inspectSessions, sessionSummary } from './sessions'
import { bindInstance, StateStore } from './store'

/** Quote display-only commands for the platform's usual shell; never execute them. */
function quote(value: string): string {
  if (/^[\w./:-]+$/.test(value))
    return value
  return `'${value.replaceAll('\'', process.platform === 'win32' ? '\'\'' : '\'"\'"\'')}'`
}

/** Continue independent checks while preventing remote access with mismatched identity. */
export async function diagnose(options: DiagnosticOptions): Promise<DiagnosticReport> {
  const checks: DiagnosticCheck[] = []
  const finish = (): DiagnosticReport => ({ version: 1, ok: !checks.some(check => check.status === 'fail'), checks })
  const command = (...args: string[]) => [
    'el-bot',
    'codex',
    ...(options.paths.profile ? ['--profile', options.paths.profile] : []),
    '--config',
    options.paths.config,
    '--credentials',
    options.paths.envFile,
    '--state',
    options.paths.state,
    ...args,
  ].map(quote).join(' ')
  let config: RemoteConfig
  try {
    config = await options.loadConfig()
    checks.push({ id: 'config', status: 'pass', summary: '配置与项目目录有效。' })
  }
  catch {
    checks.push({ id: 'config', status: 'fail', summary: '无法读取有效配置；核对 JSON、项目目录与连接设置。', actions: [command('paths'), '首次安装且配置不存在时再运行 init；不要覆盖现有配置或状态。'] })
    return finish()
  }
  let state: RemoteState | undefined
  try {
    state = await new StateStore(options.paths.state).load(config.defaultProject)
    if (config.ownerOpenId && state.owner && config.ownerOpenId !== state.owner)
      throw new Error('Owner mismatch')
    checks.push({ id: 'state', status: 'pass', summary: '状态可读取，主人绑定一致；未保存或重置状态。' })
  }
  catch {
    state = undefined
    checks.push({ id: 'state', status: 'fail', summary: '状态不可读取或主人绑定不一致。', actions: [command('paths'), '停止服务后核对原状态、主人配置与私有备份；不要删除状态来重新绑定。'] })
  }
  let credentials: BotCredentials | undefined
  let mismatch = false
  if (options.includeQQ) {
    try {
      credentials = await options.loadCredentials()
      checks.push({ id: 'credentials', status: 'pass', summary: '已从选定来源读取完整凭据；内容已隐藏。' })
    }
    catch {
      checks.push({ id: 'credentials', status: 'fail', summary: '凭据缺失、无法读取或来源不完整。', actions: [command('paths'), '在选定凭据文件同时设置 QQ_BOT_APP_ID 与 QQ_BOT_SECRET（兼容 QQ_BOT_APP_SECRET）。'] })
    }
    if (state && credentials) {
      try {
        const legacy = !state.instance
        bindInstance(state, instanceIdentity(config, credentials, options.paths.profile))
        checks.push({ id: 'identity', status: 'pass', summary: legacy ? '旧状态尚无 AppID 元数据；正式启动才备份并记录当前实例，检查不会写入。' : 'AppID、环境与 Codex 目录匹配。' })
      }
      catch {
        mismatch = true
        checks.push({ id: 'identity', status: 'fail', summary: '状态属于其他机器人、环境或 Codex 目录；已阻止连接。', actions: [command('paths'), '选择原实例对应的 profile、凭据和状态，不要重置绑定。'] })
      }
    }
  }
  if (options.includeCodex) {
    if (mismatch) {
      checks.push({ id: 'codex', status: 'skip', summary: '实例身份不匹配，未连接 Codex。' })
    }
    else {
      const codex = createCodexClient(config)
      try {
        await codex.start()
        checks.push({ id: 'codex', status: 'pass', summary: '本机 app-server 已连接。' })
        try {
          await checkCodexReadiness(codex, config)
          checks.push({ id: 'account-model', status: 'pass', summary: '登录与项目模型配置预检通过；未执行模型任务。' })
        }
        catch (error) {
          const message = error instanceof Error ? error.message : ''
          const auth = failureCode(error) === 'authentication' || message.includes('尚未登录')
          const login = [config.codexExecutable ?? 'codex', 'login'].map(quote).join(' ')
          const loginCommand = config.codexHome
            ? process.platform === 'win32' ? `$env:CODEX_HOME=${quote(config.codexHome)}; ${login}` : `CODEX_HOME=${quote(config.codexHome)} ${login}`
            : login
          checks.push({ id: 'account-model', status: 'fail', summary: auth ? '当前 Codex 目录尚未登录或账户失效。' : '账户或模型预检未通过；核对当前账户的可用模型与项目配置。', actions: auth ? [loginCommand, command('check', '--all')] : ['在本机 Codex 查看可用模型并修改遥控配置的 model，然后重新检查。', command('check', '--all')] })
        }
        if (state) {
          for (const session of await inspectSessions(codex, config, state)) {
            const usable = session.status === 'ready' || session.status === 'new'
            checks.push({ id: `session:${session.project}`, status: usable ? 'pass' : 'fail', summary: sessionSummary(session), actions: usable ? undefined : ['先停止服务，再核对账户与项目；需要新会话时执行：', command('recover', '--project', session.project)] })
          }
        }
        else {
          checks.push({ id: 'sessions', status: 'skip', summary: '状态不可用，未检查已存会话。' })
        }
        if (config.management?.enabled) {
          try {
            const schema = await CodexSchema.load(config.codexExecutable, config.experimentalApi)
            checks.push({ id: 'api-schema', status: 'pass', summary: `已生成本机协议目录：${schema.methods.length} 个方法。` })
          }
          catch {
            checks.push({ id: 'api-schema', status: 'fail', summary: '本机协议目录不可生成；检查 Codex CLI 版本。', actions: [command('api')] })
          }
        }
      }
      catch {
        checks.push({ id: 'codex', status: 'fail', summary: '本机 app-server 连接或会话检查失败；核对 Codex 安装、连接模式与网络。', actions: [`${quote(config.codexExecutable ?? 'codex')} --version`, command('paths')] })
      }
      finally {
        await codex.close().catch(() => {
          checks.push({ id: 'codex-close', status: 'fail', summary: '检查进程未能正常关闭；请在本机检查进程状态。' })
        })
      }
      if (config.desktop) {
        const desktop = new CodexDesktopClient(config.desktop)
        try {
          const tools = await desktop.listTools()
          await desktop.call('list_projects', {})
          checks.push({ id: 'desktop', status: 'pass', summary: `桌面宿主只读检查通过：${tools.length} 个工具，项目列表可访问。` })
        }
        catch {
          checks.push({ id: 'desktop', status: 'fail', summary: '桌面宿主不可访问；核对运行中的应用、管道和专用聊天。', actions: [command('desktop-check')] })
        }
        finally { await desktop.close().catch(() => {}) }
      }
    }
  }
  if (options.includeQQ) {
    if (mismatch || !state || !credentials) {
      checks.push({ id: 'qq', status: 'skip', summary: '状态、凭据或实例身份未通过，未请求 QQ API。' })
    }
    else {
      try {
        const qq = new QQBotClient({ ...credentials, sandbox: config.sandbox })
        await qq.token()
        checks.push({ id: 'qq-auth', status: 'pass', summary: 'QQ AccessToken 鉴权通过；令牌已隐藏。' })
        await qq.gateway()
        checks.push({ id: 'qq-gateway', status: 'pass', summary: '网关地址获取通过；未建立长连接或发送消息。' })
      }
      catch (error) {
        const allowlist = error instanceof QQApiError && error.code === 11298
        checks.push({ id: 'qq', status: 'fail', summary: allowlist ? 'QQ 拒绝当前出口 IP。' : 'QQ 鉴权或网关访问失败。', actions: [allowlist ? '在 q.qq.com 为当前机器人添加本机出口 IP 白名单。' : '核对 AppID / AppSecret、测试环境、网络与平台权限；不要将凭据发到聊天。', command('check', '--qq')] })
      }
    }
  }
  return finish()
}

export function formatDiagnostics(report: DiagnosticReport): string {
  return `${report.checks.map(check => `[${check.status.toUpperCase()}] ${check.id}：${check.summary}${check.actions?.map(action => `\n  ${action}`).join('') ?? ''}`).join('\n')}\n${report.ok ? '预检通过' : '预检未全部通过'}；未执行模型任务、发送 QQ 消息或重放任务。\n`
}
