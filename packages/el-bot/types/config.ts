/**
 * 监听类型
 * - all: 所有人
 * - master: 主人
 * - admin: 管理员
 * - friend: 好友
 * - group: 群聊
 */
export type BaseListenType = 'all' | 'master' | 'admin' | 'friend' | 'group'

/**
 * 目标对象
 */
export interface Target {
  /**
   * 好友
   */
  friend?: number[]
  /**
   * 群聊
   */
  group?: number[]
}

/**
 * 监听对象
 * @example 'master' 监听主人
 */
export type ListenTarget = Target | (BaseListenType | number)[]

export type Listen = BaseListenType | ListenTarget
