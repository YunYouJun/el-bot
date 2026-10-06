import type { CodexOptions } from './types'

const PLATFORM_VARIABLES = new Set([
  'PATH',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'TERM',
  'COLORTERM',
  'USER',
  'LOGNAME',
  'SHELL',
  'NO_COLOR',
  'FORCE_COLOR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
])

/** ACP children receive platform settings and explicitly selected provider variables. */
export function agentEnvironment(source: NodeJS.ProcessEnv, allowlist: string[] = []): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !key.toUpperCase().startsWith('QQ_BOT_')
    && (PLATFORM_VARIABLES.has(key.toUpperCase()) || key.startsWith('LC_') || allowlist.includes(key))))
}

/** Isolated homes inherit platform/proxy settings, not ambient provider credentials. */
export function codexEnvironment(source: NodeJS.ProcessEnv, options: CodexOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  const extra = new Set(options.envAllowlist ?? [])
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('QQ_BOT_'))
      continue
    if (!options.codexHome || PLATFORM_VARIABLES.has(key.toUpperCase()) || key.startsWith('LC_') || extra.has(key))
      env[key] = value
  }
  if (options.codexHome)
    env.CODEX_HOME = options.codexHome
  return env
}
