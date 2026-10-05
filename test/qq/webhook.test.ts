import { describe, expect, it } from 'vitest'
import { handleValidation, ValidationPayload, ValidationResponse } from '../../packages/qq-sdk/src'

/**
 * 机器人帐号
 */
export const botConfig = {
  appid: 11111111,
  secret: 'DG5g3B4j9X2KOErG',
}

/**
 * https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html#webhook%E6%96%B9%E5%BC%8F
 */
describe('webhook 信息: qq 加密验证', async () => {
  const headers = new Headers()
  headers.set('User-Agent', 'QQBot-Callback')
  headers.set('X-Bot-Appid', botConfig.appid.toString())

  /**
   * 机器人应返回
   */
  const expectedBody: ValidationResponse = {
    plain_token: 'Arq0D5A61EgUu4OxUvOp',
    signature: '87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706',
  }

  it('handleValidation', async () => {
    const payload: ValidationPayload = {
      d: { plain_token: 'Arq0D5A61EgUu4OxUvOp', event_ts: '1725442341' },
      op: 13,
    }
    const request = new Request('http://placeholder.com', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers,
    })

    const response = await handleValidation(request, botConfig.secret)
    expect(response).toEqual(expectedBody)
  })
})
