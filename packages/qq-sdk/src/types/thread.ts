/**
 * 帖子格式
 */
export enum THREAD_FORMAT {
  /**
   * 普通文本
   */
  FORMAT_TEXT = 1,
  /**
   * HTML
   */
  FORMAT_HTML = 2,
  /**
   * Markdown
   */
  FORMAT_MARKDOWN = 3,
  /**
   * JSON（content参数可参照 [RichText](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/channel/content/forum/model.html#richtext) 结构）
   */
  FORMAT_JSON = 4,
}
