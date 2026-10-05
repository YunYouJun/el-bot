import { randomBytes } from 'node:crypto'
import { readdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { isRecord } from 'qq-sdk/official'

export interface DesktopSetupOptions {
  server?: string
  pipePath?: string
  threadId: string
}

/** Use the installed adapter while requiring an explicit, host-supplied pipe. */
export async function configureDesktop(filename: string, options: DesktopSetupOptions): Promise<void> {
  const config: unknown = JSON.parse(await readFile(filename, 'utf8'))
  if (!isRecord(config) || config.desktop)
    throw new Error('配置必须存在且尚未配置 desktop；已有桌面配置请直接编辑，不会覆盖。')
  const pipePath = options.pipePath ?? process.env.CODEX_APP_TOOLS_PIPE_PATH
  if (!pipePath || (!isAbsolute(pipePath) && !pipePath.startsWith('\\\\.\\pipe\\')))
    throw new Error('需要运行中桌面宿主提供的 --pipe-path；不会扫描或猜测管道。')
  if (!options.threadId.trim())
    throw new Error('需要专用的现有桌面聊天 ID。')
  let server = options.server
  if (!server) {
    const cache = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'plugins/cache/openai-bundled/codex-app-tools')
    const versions = (await readdir(cache, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    for (const version of versions) {
      const candidate = join(cache, version, 'server.mjs')
      if (await stat(candidate).then(file => file.isFile()).catch(() => false)) {
        server = candidate
        break
      }
    }
  }
  if (!server)
    throw new Error('未找到 Codex 随应用提供的适配器，请用 --server 指定 server.mjs。')
  server = await realpath(resolve(dirname(filename), server))
  if (!(await stat(server)).isFile())
    throw new Error('桌面适配器必须是本机文件。')
  config.desktop = { server, pipePath, threadId: options.threadId }
  config.management ??= { enabled: true, allowedMethods: [] }
  const temporary = `${filename}.${randomBytes(8).toString('hex')}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await rename(temporary, filename)
  }
  finally {
    await unlink(temporary).catch(() => {})
  }
}
