import axios from 'axios'

export * from './client'
export * from './constants'
export * from './types'

export const DOMAINS = {
  /**
   * 获取调用凭证
   * 不区分正式环境、沙箱环境
   */
  TOKEN: 'https://bots.qq.com',
  /**
   * 正式环境
   */
  PRODUCTION: 'https://api.sgroup.qq.com',
  /**
   * 沙箱环境地址只会收到在开发者平台配置的沙箱频道、沙箱私信QQ号、沙箱群、沙箱单聊QQ号的事件，且调用openapi仅能操作沙箱环境
   */
  SANDBOX: 'https://sandbox.api.sgroup.qq.com',
}

/**
 * 获取调用凭证
 */
export async function getAppAccessToken(params: {
  appId: string
  clientSecret: string
}) {
  const { data } = await axios.post(`${DOMAINS.TOKEN}/app/getAppAccessToken`, {
    appId: params.appId,
    clientSecret: params.clientSecret,
  })
  return data
}
