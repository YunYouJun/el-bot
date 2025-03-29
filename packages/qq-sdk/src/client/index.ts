import { GetWsParam } from 'qq-guild-bot'
import { Channels } from './channels'

export * from './channels'

/**
 * crete qq client api
 * 官方的 qq-guild-bot 很多类型与文档不符，且未更新如帖子等接口
 * 新的 qq-sdk 会提供更好的类型支持
 *
 * 在未来，将会发布为 qq-sdk npm 包
 */
export function createQQApi(options: GetWsParam) {
  const channels = new Channels(options)

  return {
    channels,
    // TODO
  }
}
