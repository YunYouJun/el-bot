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
export function failureText(code: FailureCode): string {
  const details = FAILURE_MESSAGES[code]
  return `${details.summary}\n处理：${details.hint}\n错误类型：${code}\n任务不会自动重试；历史结果仍可查询。`
}
