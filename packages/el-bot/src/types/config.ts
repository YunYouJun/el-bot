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

export type BaseListenType = 'all' | 'master' | 'admin' | 'friend' | 'group'

/**
 * 监听格式
 */
export type Listen = Target | (BaseListenType | number)[]
