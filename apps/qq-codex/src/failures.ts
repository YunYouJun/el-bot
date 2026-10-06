import type { FailureCode } from './types'
import { isRecord } from 'qq-sdk/official'
import { FAILURE_MESSAGES } from './constants'

/** Classify structured protocol errors first; never expose raw messages or additionalDetails. */
export function failureCode(error: unknown, fallback: FailureCode = 'unknown'): FailureCode {
  const info = isRecord(error) ? error.codexErrorInfo : undefined
  const code = typeof info === 'string' ? info : isRecord(info) ? Object.keys(info)[0] : undefined
  switch (code) {
    case 'unauthorized': return 'authentication'
    case 'usageLimitExceeded': return 'quota'
    case 'rateLimitExceeded': return 'rate-limit'
    case 'contextWindowExceeded':
    case 'sessionBudgetExceeded': return 'context'
    case 'httpConnectionFailed':
    case 'responseStreamConnectionFailed':
    case 'responseStreamDisconnected':
    case 'responseTooManyFailedAttempts':
    case 'serverOverloaded': return 'network'
  }
  const message = error instanceof Error ? error.message : isRecord(error) && typeof error.message === 'string' ? error.message : ''
  if (/access token|refresh token|unauthorized|please sign in again|not logged in/i.test(message))
    return 'authentication'
  if (/model.{0,160}(?:not supported|not found|does not exist|not available)|unsupported model/i.test(message))
    return 'model'
  if (/session.{0,100}is archived|thread.{0,100}is archived/i.test(message))
    return 'session-archived'
  if (/(?:session|thread).{0,100}(?:not found|does not exist|no rollout)/i.test(message))
    return 'session-missing'
  if (/project path changed|unexpected project directory/i.test(message))
    return 'project-changed'
  if (/request timed out/i.test(message))
    return 'timeout'
  return fallback
}

/** Keep failure reports useful without forwarding secrets, account details or local paths to QQ. */
export function failureText(code: FailureCode, provider?: 'codebuddy' | 'dsh'): string {
  const details = FAILURE_MESSAGES[code]
  if (provider) {
    const name = provider === 'codebuddy' ? 'CodeBuddy' : 'dsh'
    const hints: Partial<Record<FailureCode, string>> = {
      'authentication': `在本机 ${name} 完成登录或核对 provider 凭据，再沿用原 profile 重启遥控服务。`,
      'model': `核对本机 ${name} 的可用模型与遥控配置 model，再重启服务。`,
      'stop-unconfirmed': '在本机检查当前程序和任务进程，确认任务结束后再重启遥控服务。不要将本次状态视为任务已停止。',
      'unknown': `在本机检查 ${name} 的登录、模型及项目配置，并运行 el-bot agent check --all。`,
    }
    const summary = code === 'stop-unconfirmed' ? '无法确认当前程序的任务已结束，服务已停止接收新任务。' : details.summary.replaceAll('Codex', name)
    const hint = hints[code] ?? details.hint.replaceAll('Codex', name).replaceAll('el-bot codex', 'el-bot agent')
    return `${summary}\n处理：${hint}\n错误类型：${code}\n任务不会自动重试；历史结果仍可查询。`
  }
  return `${details.summary}\n处理：${details.hint}\n错误类型：${code}\n任务不会自动重试；历史结果仍可查询。`
}
