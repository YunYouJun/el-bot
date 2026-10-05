import type { RemoteConfig } from './types'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import { isRecord } from 'qq-sdk/official'

export async function readConfig(filename: string): Promise<RemoteConfig> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(filename, 'utf8'))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(`未找到配置：${filename}。请先运行 el-bot codex init。`)
    // JSON parser errors can include source text; keep local credentials out of logs.
    throw new Error(`无法读取有效的 JSON 配置：${filename}`)
  }
  if (
    !isRecord(raw)
    || !isRecord(raw.projects)
    || !Object.keys(raw.projects).length
  ) {
    throw new Error('Configure at least one allowed project')
  }
  const projects: Record<string, string> = Object.create(null)
  for (const [name, value] of Object.entries(raw.projects)) {
    if (!/^[\w-]{1,64}$/.test(name) || typeof value !== 'string') {
      throw new Error(
        'Project names must contain only letters, digits, underscores or hyphens',
      )
    }
    const cwd = await realpath(
      isAbsolute(value) ? value : resolve(dirname(filename), value),
    )
    if (!(await stat(cwd)).isDirectory())
      throw new Error(`Project ${name} is not a directory`)
    projects[name] = cwd
  }
  const defaultProject = raw.defaultProject ?? Object.keys(projects)[0]
  if (
    typeof defaultProject !== 'string'
    || !Object.hasOwn(projects, defaultProject)
  ) {
    throw new Error('defaultProject must name an allowed project')
  }
  for (const field of ['ownerOpenId', 'codexExecutable', 'model']) {
    if (
      raw[field] !== undefined
      && (typeof raw[field] !== 'string' || !raw[field])
    ) {
      throw new Error(`${field} must be a nonempty string`)
    }
  }
  if (raw.codexConnection !== undefined && !['stdio', 'desktop'].includes(String(raw.codexConnection)))
    throw new Error('codexConnection must be stdio or desktop')
  if (raw.codexHome !== undefined && (typeof raw.codexHome !== 'string' || !isAbsolute(raw.codexHome)))
    throw new Error('codexHome must be an absolute directory path')
  if (raw.codexHome && raw.codexConnection === 'desktop')
    throw new Error('codexHome isolation requires stdio; desktop uses the existing desktop account and session store')
  if (raw.codexEnvAllowlist !== undefined && (!Array.isArray(raw.codexEnvAllowlist) || !raw.codexEnvAllowlist.every(key => typeof key === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(key) && !key.startsWith('QQ_BOT_'))))
    throw new Error('codexEnvAllowlist must contain environment variable names and cannot include QQ credentials')
  if (raw.codexSocket !== undefined && (typeof raw.codexSocket !== 'string' || !isAbsolute(raw.codexSocket)))
    throw new Error('codexSocket must be an absolute socket path')
  if (raw.codexSocket && raw.codexConnection !== 'desktop')
    throw new Error('codexSocket requires codexConnection: desktop')
  if (raw.experimentalApi !== undefined && typeof raw.experimentalApi !== 'boolean')
    throw new Error('experimentalApi must be a boolean')
  if (raw.management !== undefined && (!isRecord(raw.management)
    || typeof raw.management.enabled !== 'boolean'
    || (raw.management.allowedMethods !== undefined && (!Array.isArray(raw.management.allowedMethods) || !raw.management.allowedMethods.every(method => typeof method === 'string' && /^[\w/]+$/.test(method)))))) {
    throw new Error('management must specify enabled and an optional allowedMethods array')
  }
  let desktop: RemoteConfig['desktop']
  if (raw.desktop !== undefined) {
    const settings = raw.desktop
    if (!isRecord(settings) || !['server', 'pipePath', 'threadId'].every(field => typeof settings[field] === 'string' && !!settings[field]))
      throw new Error('desktop requires server, pipePath and a dedicated threadId')
    const server = await realpath(resolve(dirname(filename), String(settings.server)))
    if (!(await stat(server)).isFile())
      throw new Error('Desktop adapter server must be a file')
    if (!isAbsolute(String(settings.pipePath)) && !String(settings.pipePath).startsWith('\\\\.\\pipe\\'))
      throw new Error('Desktop pipePath must be an absolute host pipe path')
    desktop = { server, pipePath: String(settings.pipePath), threadId: String(settings.threadId) }
  }
  if (
    raw.transport !== undefined
    && raw.transport !== 'websocket'
    && raw.transport !== 'webhook'
  ) {
    throw new Error('transport must be websocket or webhook')
  }
  if (raw.sandbox !== undefined && typeof raw.sandbox !== 'boolean')
    throw new Error('sandbox must be a boolean')
  if (raw.messageFormat !== undefined && raw.messageFormat !== 'markdown' && raw.messageFormat !== 'text')
    throw new Error('messageFormat must be markdown or text')
  const webhookPort = raw.webhookPort ?? 8788
  if (
    !Number.isInteger(webhookPort)
    || typeof webhookPort !== 'number'
    || webhookPort < 1
    || webhookPort > 65535
  ) {
    throw new Error('Invalid webhookPort')
  }
  return {
    projects,
    defaultProject,
    ownerOpenId: raw.ownerOpenId as string | undefined,
    codexExecutable: raw.codexExecutable as string | undefined,
    codexHome: raw.codexHome as string | undefined,
    codexEnvAllowlist: raw.codexEnvAllowlist as string[] | undefined,
    codexConnection: raw.codexConnection as RemoteConfig['codexConnection'],
    codexSocket: raw.codexSocket as string | undefined,
    experimentalApi: raw.experimentalApi as boolean | undefined,
    management: isRecord(raw.management) ? { enabled: raw.management.enabled as boolean, allowedMethods: (raw.management.allowedMethods as string[] | undefined) ?? [] } : undefined,
    desktop,
    model: raw.model as string | undefined,
    transport: raw.transport ?? 'websocket',
    webhookPort,
    sandbox: raw.sandbox ?? false,
    messageFormat: raw.messageFormat ?? 'markdown',
  }
}
