import fs from 'fs'
import yaml from 'js-yaml'

/**
 * 单纯 typeof [] 会返回 object
 * @param item
 */
function isObject(item: any) {
  return typeof item === 'object' && !Array.isArray(item)
}

/**
 * https://www.npmjs.com/package/js-yaml
 * @param path 配置文件名
 */
export function parse(path: string) {
  return yaml.load(fs.readFileSync(path, 'utf8'))
}

/**
 * 合并配置
 * @param target 目标配置
 * @param source 源配置
 */
export function merge(target: any, source: any): any {
  for (const key in source) {
    if (isObject(target[key]) && isObject(source[key]))
      merge(target[key], source[key])
    else
      target[key] = source[key]
  }
  return target
}
