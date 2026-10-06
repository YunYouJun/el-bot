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
  if (raw.agent !== undefined && (typeof raw.agent !== 'string' || !['codex', 'codebuddy', 'dsh'].includes(raw.agent)))
    throw new Error('agent must be codex, codebuddy or dsh')
  for (const field of ['ownerOpenId', 'codexExecutable', 'agentExecutable', 'model']) {
    if (
      raw[field] !== undefined
      && (typeof raw[field] !== 'string' || !raw[field] || raw[field].includes('\0'))
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
  if (raw.agentEnvAllowlist !== undefined && (!Array.isArray(raw.agentEnvAllowlist) || !raw.agentEnvAllowlist.every(key => typeof key === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(key) && !key.startsWith('QQ_BOT_'))))
    throw new Error('agentEnvAllowlist must contain environment variable names and cannot include QQ credentials')
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
  if (raw.agent && raw.agent !== 'codex'
    && (raw.codexConnection === 'desktop' || raw.codexHome !== undefined || raw.codexSocket !== undefined || raw.codexExecutable !== undefined
      || raw.codexEnvAllowlist !== undefined || raw.experimentalApi === true || raw.desktop !== undefined || (isRecord(raw.management) && raw.management.enabled))) {
    throw new Error('ACP agents do not support Codex connection, home, desktop or management settings')
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
  if (raw.messageFormat !== undefined && !['markdown', 'text', 'image'].includes(String(raw.messageFormat)))
    throw new Error('messageFormat must be markdown, text or image')
  let image: RemoteConfig['image']
  if (raw.image !== undefined || raw.messageFormat === 'image') {
    const settings = raw.image ?? {}
    if (!isRecord(settings))
      throw new Error('image must be an object')
    const transport = settings.transport ?? (settings.publicBaseUrl === undefined ? 'upload' : 'public')
    if (transport !== 'upload' && transport !== 'public')
      throw new Error('image.transport must be upload or public')
    let publicBaseUrl: string | undefined
    if (transport === 'public') {
      let url: URL
      try {
        if (typeof settings.publicBaseUrl !== 'string')
          throw new Error('Missing URL')
        url = new URL(settings.publicBaseUrl)
      }
      catch {
        throw new Error('image.publicBaseUrl must be a public HTTPS URL')
      }
      if (url.protocol !== 'https:' || url.href.length > 512 || url.username || url.password || url.search || url.hash || /[()\s]/.test(url.href) || !url.pathname.replace(/\/$/, '').endsWith('/qq-codex/images'))
        throw new Error('image.publicBaseUrl must end in /qq-codex/images without credentials, query or fragment')
      publicBaseUrl = url.href.replace(/\/$/, '')
    }
    else if (settings.publicBaseUrl !== undefined) {
      throw new Error('image.publicBaseUrl requires public transport')
    }
    if (settings.theme !== undefined && !['light', 'dark'].includes(String(settings.theme)))
      throw new Error('image.theme must be light or dark')
    if (settings.fontFamily !== undefined && (typeof settings.fontFamily !== 'string' || !settings.fontFamily || settings.fontFamily.length > 200))
      throw new Error('image.fontFamily must be a nonempty font family name')
    const fontFiles: string[] = []
    if (settings.fontFiles !== undefined) {
      if (!Array.isArray(settings.fontFiles) || settings.fontFiles.length > 8 || !settings.fontFiles.every(file => typeof file === 'string'))
        throw new Error('image.fontFiles must contain at most eight local font files')
      for (const file of settings.fontFiles) {
        const font = await realpath(resolve(dirname(filename), file))
        if (!(await stat(font)).isFile())
          throw new Error('image.fontFiles must reference local files')
        fontFiles.push(font)
      }
    }
    image = { transport, ...(publicBaseUrl ? { publicBaseUrl } : {}), theme: (settings.theme ?? 'light') as 'light' | 'dark', ...(fontFiles.length ? { fontFiles } : {}), ...(settings.fontFamily ? { fontFamily: settings.fontFamily as string } : {}) }
  }
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
    agent: raw.agent as RemoteConfig['agent'],
    agentExecutable: raw.agentExecutable as string | undefined,
    agentEnvAllowlist: raw.agentEnvAllowlist as string[] | undefined,
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
    messageFormat: (raw.messageFormat ?? 'markdown') as RemoteConfig['messageFormat'],
    image,
  }
}
