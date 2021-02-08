import { AnswerOptions } from "../plugins/answer";
import { ForwardOptions } from "../plugins/forward";
import { RssOptions } from "../plugins/rss";

export interface BotConfig {
  /**
   * 机器人名
   */
  name?: string;

  /**
   * 是否自动加载 plugins 文件夹下的自定义插件
   */
  autoloadPlugins?: boolean;
  /**
   * 插件配置
   */
  plugins?: {
    default?: string[];
    official?: string[];
    community?: string[];
    custom?: string[];
  };
  /**
   * 主人（超级管理员）
   */
  master: number[];
  /**
   * 管理员
   */
  admin?: number[];

  // 默认插件
  answer?: AnswerOptions;
  forward?: ForwardOptions;
  rss?: RssOptions;

  /**
   * 其他插件配置
   */
  [propName: string]: any;
}
