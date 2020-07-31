import { LimitOptions } from "src/plugins/limit";
import { TeachOptions } from "src/plugins/teach";

export interface BotConfig {
  /**
   * 机器人名
   */
  name: string;
  /**
   * 插件配置
   */
  plugins: {
    default: string[];
    official?: string[];
    community?: string[];
    custom?: string[];
  };
  /**
   * 数据库存储路径
   */
  db_path: string;
  /**
   * 主人（超级管理员）
   */
  master: number[];
  /**
   * 管理员
   */
  admin: number[];
  /**
   * limit 插件配置
   */
  limit?: LimitOptions;
  /**
   * teach 插件配置
   */
  teach?: TeachOptions;
  /**
   * 其他插件配置
   */
  [propName: string]: any;
}

const defaultConfig: BotConfig = {
  name: "el-bot",
  plugins: {
    default: [
      // "dev",
      "answer",
      // "cli",
      // "forward",
      // "rss",
      // "limit",
      // "teach"
    ],
  },
  db_path: "./tmp/el-bot.json",
  master: [910426929],
  admin: [910426929],
  limit: {
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
  },
  teach: {
    listen: ["master", "admin"],
    reply: "我学会了！",
    else: "你在教我做事？",
  },
};

export default {
  defaultConfig,
};
