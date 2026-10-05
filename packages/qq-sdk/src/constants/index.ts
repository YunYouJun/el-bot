export const QQAvailableIntentsEvents = {
  /**
   * 用户在单聊发送消息给机器人
   * @see https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/send-receive/event.html#%E5%8D%95%E8%81%8A%E6%B6%88%E6%81%AF
   */
  C2C_MESSAGE_CREATE: 'C2C_MESSAGE_CREATE',
  /**
   * 用户在群聊@机器人发送消息
   */
  GROUP_AT_MESSAGE_CREATE: 'GROUP_AT_MESSAGE_CREATE',
}

export const DOMAINS = {
  /**
   * 获取调用凭证
   * 不区分正式环境、沙箱环境
   */
  TOKEN: 'https://api.bot.qq.com',
  /**
   * 正式环境
   */
  PRODUCTION: 'https://api.bot.qq.com',
  /**
   * 沙箱环境地址只会收到在开发者平台配置的沙箱频道、沙箱私信QQ号、沙箱群、沙箱单聊QQ号的事件，且调用openapi仅能操作沙箱环境
   */
  SANDBOX: 'https://sandbox.api.bot.qq.com',
}
