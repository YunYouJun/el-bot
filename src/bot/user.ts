import Bot from 'src'

export default class User {
  constructor(public bot: Bot) {}
  /**
   * 是否是主人
   * @param qq
   */
  isMaster(qq: number) {
    return this.bot.el.config.master.includes(qq)
  }

  /**
   * 是否是管理员
   * @param qq
   */
  isAdmin(qq: number) {
    return this.bot.el.config.admin.includes(qq)
  }

  /**
   * 是否拥有权限
   * @param qq
   */
  isAllowed(qq: number) {
    return this.isMaster(qq) || this.isAdmin(qq)
  }
}
