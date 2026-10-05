import axios from 'axios'
import { DOMAINS } from './constants'

export * from './client'
export * from './constants'
export * from './official/client'
export * from './official/gateway'

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

export * from './official/types'
export * from './official/webhook'
export * from './types'
export * from './validation'
