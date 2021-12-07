import fs from 'fs'
import path from 'path'

/**
 * 寻找文件
 * @param dir
 * @param formats
 * @param pathOnly
 */
export function lookupFile(
  dir: string,
  formats: string[],
  pathOnly = false,
): string | undefined {
  for (const format of formats) {
    const fullPath = path.join(dir, format)
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile())
      return pathOnly ? fullPath : fs.readFileSync(fullPath, 'utf-8')
  }
  const parentDir = path.dirname(dir)
  if (parentDir !== dir)
    return lookupFile(parentDir, formats, pathOnly)
}
