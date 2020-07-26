import yaml from "js-yaml";
import fs from "fs";

/**
 * https://www.npmjs.com/package/js-yaml#safeload-string---options-
 * now we can use!!js / undefined!!js / function !!js / regexp
 * @param path 配置文件名
 */
function parse(path: string) {
  // return yaml.safeLoad(fs.readFileSync(path, "utf8"));
  return yaml.load(fs.readFileSync(path, "utf8"));
}

/**
 * 单纯 typeof [] 会返回 object
 * @param item
 */
function isObject(item: any) {
  return typeof item === "object" && !Array.isArray(item);
}

/**
 * 合并配置
 * @param target 目标配置
 * @param source 源配置
 */
function merge(target: any, source: any): any {
  for (const key in source) {
    if (
      target.hasOwnProperty(key) &&
      isObject(target[key]) &&
      isObject(source[key])
    ) {
      merge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

export { parse, merge };
