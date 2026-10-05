import { describe, expect, it } from 'vitest'
import { failureCode, failureText } from './failures'

describe('safe actionable failures', () => {
  it.each([
    [{ codexErrorInfo: 'unauthorized' }, 'authentication'],
    [{ codexErrorInfo: 'usageLimitExceeded' }, 'quota'],
    [{ codexErrorInfo: 'rateLimitExceeded' }, 'rate-limit'],
    [{ codexErrorInfo: 'contextWindowExceeded' }, 'context'],
    [{ codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 502 } } }, 'network'],
    [{ message: JSON.stringify({ error: { message: 'The \'gpt-6.1-sol\' model is not supported when using Codex with a ChatGPT account.' } }) }, 'model'],
    [new Error('Codex RPC error -32600: session test is archived. Run codex unarchive first.'), 'session-archived'],
    [new Error('Project path changed; use /new before resuming'), 'project-changed'],
    [new Error('Codex request timed out: thread/resume'), 'timeout'],
  ])('classifies %j as %s', (error, code) => {
    expect(failureCode(error)).toBe(code)
  })

  it('does not disclose provider messages, credentials, local paths or links in the QQ report', () => {
    const error = { codexErrorInfo: 'other', message: 'secret-key /Users/private/profile https://private.example?token=secret', additionalDetails: 'QQ_BOT_SECRET=private' }
    const text = failureText(failureCode(error))
    expect(text).toContain('错误类型：unknown')
    expect(text).not.toContain('secret')
    expect(text).not.toContain('/Users')
    expect(text).not.toContain('https://')
  })
})
