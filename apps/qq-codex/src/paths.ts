import type { CliPaths, PathOptions } from './types'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

/** Resolve explicit paths first, then a legacy project config or user defaults. */
export function resolvePaths(options: PathOptions, cwd = process.cwd(), home = homedir()): CliPaths {
  if (options.profile !== undefined && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(options.profile))
    throw new Error('profile 必须是 1–64 个小写字母、数字、下划线或连字符，且以字母或数字开头。')
  if (options.profile) {
    const directory = resolve(home, '.el-bot/codex', options.profile)
    return {
      profile: options.profile,
      config: resolve(cwd, options.config ?? resolve(directory, 'config.json')),
      envFile: resolve(cwd, options.envFile ?? resolve(directory, 'credentials.env')),
      state: resolve(cwd, options.state ?? resolve(directory, 'state.json')),
      codexHome: resolve(directory, 'codex'),
    }
  }
  const directory = resolve(home, '.el-bot')
  const legacy = resolve(cwd, '.el-bot/qq-codex.json')
  return {
    config: options.config
      ? resolve(cwd, options.config)
      : existsSync(legacy) ? legacy : resolve(directory, 'qq-codex.json'),
    state: resolve(cwd, options.state ?? resolve(directory, 'qq-codex-state.json')),
    envFile: resolve(cwd, options.envFile ?? resolve(directory, 'qq-codex.env')),
  }
}
