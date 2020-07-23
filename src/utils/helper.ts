/**
 * 判断是否为 URL 链接
 * @param url
 */
export function isUrl(url: string) {
  return /^https?:\/\/.+/.test(url)
}
