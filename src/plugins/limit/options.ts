export interface LimitOptions {
  /**
   * 间隔
   */
  interval: number;
  /**
   * 数量
   */
  count: number;
  /**
   * 发送者
   */
  sender: {
    /**
     * 超过时间清空记录
     */
    interval: number;
    /**
     * 连续次数
     */
    maximum: number;
    /**
     * 提示
     */
    tooltip: string;
    /**
     * 禁言时间
     */
    time: number;
  };
}

/**
 * 默认配置
 */
const limitOptions: LimitOptions = {
  interval: 30000,
  count: 20,
  sender: {
    // 超过十分钟清空记录
    interval: 600000,
    // 连续次数
    maximum: 3,
    tooltip: "我生气了",
    // 禁言时间
    time: 600,
  },
};

export default limitOptions;
