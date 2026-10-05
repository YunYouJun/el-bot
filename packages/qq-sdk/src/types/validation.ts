/**
 * @see https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html#%E9%80%9A%E7%94%A8%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84-payload
 */
export interface ValidationPayload {
  /**
   * 事件 id
   */
  id?: string
  /**
   * 指的是 opcode，参考连接维护
   */
  op: number
  /**
   * 下行消息都会有一个序列号，标识消息的唯一性，客户端需要再发送心跳的时候，携带客户端收到的最新的s
   */
  s?: number
  /**
   * 代表事件类型。主要用在op为 0 Dispatch 的时候
   */
  t?: string
  /**
   * 代表事件内容，不同事件类型的事件内容格式都不同，请注意识别。主要用在op为 0 Dispatch 的时候
   */
  d: ValidationPayloadData
}

/**
 * 请求结构(Payload.d)
 */
export interface ValidationPayloadData {
  /**
   * 需要计算签名的字符串
   */
  plain_token: string
  /**
   * 计算签名使用时间戳
   */
  event_ts: string
}

/**
 * 返回结果
 */
export interface ValidationResponse {
  /**
   * 需要计算签名的字符串
   */
  plain_token: string
  /**
   * 签名
   */
  signature: string
}
