import type { BotCredentials, RemoteConfig } from './types'
import { once } from 'node:events'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { CodexClient, CodexDesktopClient, CodexSchema } from '@el-bot/codex'
import { serve } from '@hono/node-server'
import consola from 'consola'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import {
  createQQWebhookHandler,
  QQBotClient,
  QQGateway,
} from 'qq-sdk/official'
import { statusCard } from './cards'
import { RemoteController } from './controller'
import { renderCardImage } from './image'
import { CardImageStore } from './image-store'
import { CardImageUploader } from './image-upload'
import { checkCodexReadiness } from './readiness'
import { inspectSessions, sessionSummary } from './sessions'
import { bindInstance, StateStore } from './store'

export function createCodexClient(config: RemoteConfig): CodexClient {
  return new CodexClient({ executable: config.codexExecutable, codexHome: config.codexHome, envAllowlist: config.codexEnvAllowlist, connection: config.codexConnection, socketPath: config.codexSocket, experimentalApi: config.experimentalApi, terminalControl: true })
}

export function instanceIdentity(config: RemoteConfig, credentials: BotCredentials, profile?: string) {
  return { appId: credentials.appId, sandbox: config.sandbox, ...(profile ? { profile } : {}), codexHome: config.codexHome ?? resolve(process.env.CODEX_HOME ?? resolve(homedir(), '.codex')) }
}

/** Inspect desktop capabilities without modifying the app or submitting a model turn. */
export async function checkDesktop(config: RemoteConfig): Promise<void> {
  if (!config.desktop)
    throw new Error('请先配置 desktop.server、pipePath 和专用 threadId。')
  const desktop = new CodexDesktopClient(config.desktop)
  try {
    const tools = await desktop.listTools()
    await desktop.call('list_projects', {})
    consola.success(`桌面宿主已连接，发现 ${tools.length} 个工具；项目列表访问通过。未启动模型任务。`)
  }
  finally { await desktop.close() }
}

/** Check local Codex authentication without starting a model turn. */
export async function checkLocal(config: RemoteConfig, statePath?: string): Promise<void> {
  if (config.messageFormat === 'image' && config.image) {
    await renderCardImage(statusCard(config.defaultProject, undefined, [], 1, 'local-check')!, config.image)
    consola.success(config.image.publicBaseUrl ? '本机图片渲染通过；公网图片入口需另行核验。' : '本机图片渲染通过；发送时直接上传到 QQ，无需公网图片入口。未上传图片、未发送消息。')
  }
  const codex = createCodexClient(config)
  try {
    await codex.start()
    await checkCodexReadiness(codex, config)
    if (statePath) {
      const state = await new StateStore(statePath).load(config.defaultProject)
      const sessions = await inspectSessions(codex, config, state)
      for (const session of sessions)
        consola.info(sessionSummary(session))
      if (sessions.some(session => !['ready', 'new'].includes(session.status)))
        throw new Error('已有会话无法继续。请先恢复指定项目；不会自动重试或重放任务。')
    }
    if (config.management?.enabled) {
      const schema = await CodexSchema.load(config.codexExecutable, config.experimentalApi)
      consola.success(`已生成本机协议目录：${schema.methods.length} 个方法。`)
    }
    consola.success(`Codex 已连接；已检查登录信息与 ${Object.keys(config.projects).length} 个项目的模型配置。未启动模型任务。`)
  }
  finally { await codex.close() }
}

/** Check QQ credentials and gateway discovery without subscribing or sending messages. */
export async function checkQQ(config: RemoteConfig, credentials: BotCredentials): Promise<void> {
  const qq = new QQBotClient({ ...credentials, sandbox: config.sandbox })
  await qq.token()
  consola.success('QQ AccessToken 鉴权成功（令牌已隐藏）。')
  await qq.gateway()
  consola.success('QQ 网关地址获取成功。未建立长连接、未发送消息。')
}

/** Start the owner-bound remote service with existing state and graceful signal cleanup. */
export async function startRemote(config: RemoteConfig, statePath: string, credentials: BotCredentials, profile?: string): Promise<void> {
  const { appId, secret } = credentials
  const codex = createCodexClient(config)
  const desktop = config.desktop ? new CodexDesktopClient(config.desktop) : undefined
  const qq = new QQBotClient({ appId, secret, sandbox: config.sandbox })
  const store = new StateStore(statePath)
  const unlock = await store.lock()
  const imageStore = config.messageFormat === 'image' && config.image?.publicBaseUrl ? new CardImageStore({ ...config.image, publicBaseUrl: config.image.publicBaseUrl }) : undefined
  const images = imageStore ?? (config.messageFormat === 'image' && config.image ? new CardImageUploader(qq, config.image) : undefined)
  let controller: RemoteController | undefined
  let stopTransport = () => {}
  let stopHttp = () => {}
  let shuttingDown = false
  const signals = new Map<NodeJS.Signals, () => void>()
  const shutdown = async () => {
    if (shuttingDown)
      return
    shuttingDown = true
    for (const [signal, handler] of signals) process.off(signal, handler)
    stopTransport()
    stopHttp()
    if (controller)
      await controller.close()
    else await codex.close()
    await desktop?.close()
    imageStore?.close()
    await unlock()
  }
  try {
    const state = await store.load(config.defaultProject)
    const legacy = !state.instance
    bindInstance(state, instanceIdentity(config, credentials, profile))
    if (legacy)
      await store.backupLegacy()
    const schema = config.management?.enabled ? await CodexSchema.load(config.codexExecutable, config.experimentalApi) : undefined
    if (desktop)
      await desktop.listTools()
    controller = new RemoteController(
      config,
      state,
      qq,
      codex,
      value => store.save(value),
      error => consola.warn(
        (error instanceof Error ? error.message : 'Protocol operation failed')
          .split(secret).join('[redacted]'),
      ),
      { schema, desktop, images },
    )
    await store.save(state)
    await codex.start()
    await checkCodexReadiness(codex, config)
    for (const session of await inspectSessions(codex, config, state)) {
      if (!['new', 'ready'].includes(session.status))
        consola.warn(sessionSummary(session))
    }
    const remote = controller
    if (!state.owner) {
      consola.info(
        `Pair within 10 minutes by sending this privately to your bot:\n/pair ${remote.pairingCode}`,
      )
    }
    if (config.transport === 'webhook' || imageStore) {
      const app = new Hono()
      if (imageStore)
        app.route('/', imageStore.app)
      if (config.transport === 'webhook') {
        app.use('/qq/events', bodyLimit({ maxSize: 1024 * 1024 }))
        const handler = createQQWebhookHandler({ appId, secret, onMessage: message => remote.accept(message) })
        app.post('/qq/events', c => handler(c.req.raw))
      }
      const server = serve({
        fetch: app.fetch,
        hostname: '127.0.0.1',
        port: config.webhookPort,
      })
      stopHttp = () => {
        server.close()
      }
      await once(server, 'listening')
      consola.success(
        `QQ HTTP service listening at http://127.0.0.1:${config.webhookPort}. Configure your HTTPS reverse proxy for the enabled endpoints.`,
      )
    }
    if (config.transport !== 'webhook') {
      const gateway = new QQGateway(qq, {
        onMessage: message => remote.accept(message),
        onError: error => consola.warn(error.message),
        onReady: () => consola.success('QQ gateway connected'),
      })
      stopTransport = () => gateway.stop()
      await gateway.start()
    }
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const handler = () => {
        void shutdown().catch(() => {
          process.exitCode = 1
        })
      }
      signals.set(signal, handler)
      process.once(signal, handler)
    }
  }
  catch (error) {
    await shutdown()
    throw error
  }
}
