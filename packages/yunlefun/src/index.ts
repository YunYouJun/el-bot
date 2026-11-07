import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AdapterBase, GenerateOptions } from './adapter'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createAdapter, PROVIDER } from './adapter'
import { routes, WEB_PATH } from './http'
import { DEFAULT_RUNTIME_ORIGIN } from './protocol'
import { YunlefunService } from './service'
import { AccountStore } from './store'

export const name = 'el-bot-yunlefun'
export const inject = ['llm', 'webServer', 'connection']
interface Context {
  llm: {
    registerAdapter: (providers: string[], adapter: {
      stream: (options: GenerateOptions) => AsyncIterable<unknown>
    }) => (() => void)
  }
  webServer: {
    getOrigin: () => string
    register: (route: {
      kind: 'prefix'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
    }) => (() => void)
  }
  connection: {
    requestRejection: (request: IncomingMessage) => number | undefined
  }
  effect: (install: () => Promise<() => void>) => unknown
  provide: (name: string, value: unknown) => void
  emit: (event: string, provider: string) => unknown
}
export interface Settings {
  profileDirectory?: string
  publicOrigin?: string
  runtimeOrigin?: string
}
export function apply(ctx: Context, settings: Settings = {}) {
  const profile = settings.profileDirectory ?? join(homedir(), '.dsh/profiles/cloud')
  if (!isAbsolute(profile))
    throw new Error('YunLeFun profileDirectory must be absolute')
  const publicOrigin = settings.publicOrigin ?? 'https://bot.yunle.fun'
  if (new URL(publicOrigin).protocol !== 'https:' || new URL(publicOrigin).origin !== publicOrigin)
    throw new Error('YunLeFun publicOrigin must be an HTTPS origin')
  ctx.effect(async () => {
    const require = createRequire(join(profile, 'package.json'))
    const sdk = createRequire(require.resolve('@deepseek-ai/dsh/package.json'))
    const llm = await import(pathToFileURL(sdk.resolve('@deepseek-ai/dsh-llm')).href) as {
      LlmAdapter: AdapterBase
      attributionHeaders: () => Record<string, string>
    }
    const store = new AccountStore(join(profile, 'el-bot-yunlefun', 'account.json'))
    await store.load()
    const service = new YunlefunService(store, settings.runtimeOrigin ?? DEFAULT_RUNTIME_ORIGIN, { fetch: (input, init) => fetch(input, { ...init, headers: { ...llm.attributionHeaders(), ...init?.headers } }) })
    const adapter = createAdapter(llm.LlmAdapter, service)
    const unregister = ctx.llm.registerAdapter([PROVIDER], adapter)
    let unroute: (() => void) | undefined
    try {
      ctx.provide('elBotYunlefun', service)
      unroute = ctx.webServer.register({ kind: 'prefix', path: WEB_PATH, handler: routes(service, req => ctx.connection.requestRejection(req), publicOrigin, () => ctx.emit('llm/models-updated', PROVIDER), ctx.webServer.getOrigin()) })
    }
    catch (error) {
      unregister()
      throw error
    }
    return () => {
      unroute?.()
      unregister()
    }
  })
}
