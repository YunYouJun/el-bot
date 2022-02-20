import fs from 'fs'
import yaml from 'js-yaml'

/**
 * 单纯 typeof [] 会返回 object
 * @deprecated
 * @param item
 */
function isObject(item: any) {
  return typeof item === 'object' && !Array.isArray(item)
}

/**
 * https://www.npmjs.com/package/js-yaml
 * @param path 配置文件名
 */
export function parseYaml(path: string) {
  return yaml.load(fs.readFileSync(path, 'utf8'))
}

/**
 * 合并配置
 * @deprecated
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

function mergeConfigRecursively(
  defaults: Record<string, any>,
  overrides: Record<string, any>,
  rootPath: string,
) {
  const merged: Record<string, any> = { ...defaults }
  for (const key in overrides) {
    const value = overrides[key]
    if (value == null)
      continue

    const existing = merged[key]

    if (existing == null) {
      merged[key] = value
      continue
    }

    if (Array.isArray(existing) || Array.isArray(value)) {
      merged[key] = [...arraify(existing ?? []), ...arraify(value ?? [])]
      continue
    }
    if (isObject(existing) && isObject(value)) {
      merged[key] = mergeConfigRecursively(
        existing,
        value,
        rootPath ? `${rootPath}.${key}` : key,
      )
      continue
    }

    merged[key] = value
  }
  return merged
}

export function mergeConfig(
  defaults: Record<string, any>,
  overrides: Record<string, any>,
  isRoot = true,
): Record<string, any> {
  return mergeConfigRecursively(defaults, overrides, isRoot ? '' : '.')
}

function arraify<T>(target: T | T[]): T[] {
  return Array.isArray(target) ? target : [target]
}
