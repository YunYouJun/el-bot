import type { ReplyPreferences, ReplyPreferenceUpdate } from './preferences-types'
import { randomUUID } from 'node:crypto'
import { open, readFile, realpath, rename, unlink } from 'node:fs/promises'
import { readConfig } from './config'
import { runtimeStatus } from './control'

/** Update only presentation options; never restart a daemon or rewrite its state. */
export async function replyPreferences(configPath: string, statePath: string, update: ReplyPreferenceUpdate = {}): Promise<ReplyPreferences> {
  if (update.messageFormat !== undefined && !['image', 'markdown', 'text'].includes(update.messageFormat))
    throw new Error('回复格式必须为 image、markdown 或 text。')
  if (update.imageTheme !== undefined && !['light', 'dark'].includes(update.imageTheme))
    throw new Error('图片主题必须为 light 或 dark。')
  const config = await readConfig(configPath)
  const result: ReplyPreferences = { messageFormat: config.messageFormat ?? 'markdown', imageTheme: config.image?.theme ?? 'light', restartRequired: false }
  if (Object.values(update).every(value => value === undefined))
    return result
  const path = await realpath(configPath)
  const lockPath = `${path}.preferences.lock`
  const lock = await open(lockPath, 'wx', 0o600).catch(() => {
    throw new Error('回复设置正在保存，或配置目录不可写；请稍后重试。')
  })
  const temporary = `${path}.preferences-${randomUUID()}.tmp`
  try {
    const original = await readFile(path, 'utf8')
    // Validate again under the writer lock. Parser diagnostics must not expose source text.
    await readConfig(path)
    let raw
    try {
      raw = JSON.parse(original)
    }
    catch { throw new Error('配置不是有效 JSON；请修复后重试。') }
    const before = { messageFormat: raw.messageFormat ?? 'markdown', imageTheme: raw.image?.theme ?? 'light' }
    if (update.messageFormat !== undefined)
      raw.messageFormat = update.messageFormat
    if (update.imageTheme !== undefined)
      raw.image = { ...raw.image, theme: update.imageTheme }
    const messageFormat = raw.messageFormat ?? 'markdown'
    const imageTheme = raw.image?.theme ?? 'light'
    if (messageFormat === before.messageFormat && imageTheme === before.imageTheme)
      return { messageFormat, imageTheme, restartRequired: (await runtimeStatus(statePath)).phase !== 'stopped' }
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(`${JSON.stringify(raw, null, 2)}\n`)
      await file.sync()
    }
    finally { await file.close() }
    await readConfig(temporary)
    if (await readFile(path, 'utf8') !== original)
      throw new Error('配置已被其他程序修改；请刷新设置后重试。')
    await rename(temporary, path)
    return { messageFormat, imageTheme, restartRequired: (await runtimeStatus(statePath)).phase !== 'stopped' }
  }
  finally {
    await unlink(temporary).catch(() => {})
    await lock.close()
    await unlink(lockPath)
  }
}
