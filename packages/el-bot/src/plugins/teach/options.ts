import * as Config from 'el-bot/src/types/config'

export interface TeachOptions {
  listen: Config.Listen
  /**
   * 回复
   */
  reply: string
  /**
   * 没有权限时的回复
   */
  else: string
}

const teachOptions: TeachOptions = {
  listen: ['master', 'admin'],
  reply: '我学会了！',
  else: '你在教我做事？',
}

export default teachOptions
