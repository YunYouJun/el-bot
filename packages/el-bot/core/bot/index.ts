import type { MessageType } from 'mirai-ts'
import type mongoose from 'mongoose'
import type { NCWebsocket, SendMessageSegment } from 'node-napcat-ts'
import type { BotAdapter, MessageContext, MessageTarget } from '../adapter'
import type { ElConfig, ElUserConfig } from '../config/el'
// type
import type { Plugin, PluginInstallFunction } from './plugins/class'
import path from 'node:path'
import process from 'node:process'
import { Command as CliCommand } from 'commander'
import consola from 'consola'

import fs from 'fs-extra'
import { createHooks } from 'hookable'
import Mirai from 'mirai-ts'
import { createNapcatClient, isNapcatAdapter, NapcatAdapter, replyNapcatMessage } from '#plugin-qq'
import { BotServer, createServer } from '../../node/server'
import { LiteCycleHook, NapcatMessage } from '../composition-api'
import { setCurrentInstance } from '../composition-api/lifecycle'
import { resolveElConfig } from '../config/el'
import { connectDb } from '../db'
import { isFunction } from '../shared'

import { handleError } from '../utils/error'

// shared

// node

import { statement } from '../utils/misc'
import { AdapterRegistry } from './adapters'
import { Command } from './command'
import { logger } from './logger'
import { dispatchAdapterMessage } from './message'
import { createQQSDK } from './platform'
import { Plugins } from './plugins'
import { Sender } from './sender'
import { Status } from './status'
import { User } from './user'

export { AdapterRegistry } from './adapters'
export * from './command'
export * from './logger'
export * from './plugins'

/**
 * 创建机器人
 * @param el 用户配置 | el-bot.config.ts 所在目录
 */
export async function createBot(el: ElUserConfig | string = process.cwd()) {
  let elConfig: ElUserConfig

  // resolve el-bot.config.ts
  if (typeof el === 'string') {
    const rootDir = el
    const elConfigFile = path.resolve(rootDir, 'el-bot.config.ts')
    if (!(await fs.exists(elConfigFile))) {
      consola.error('el-bot.config.ts not found')
      consola.error('Please create `el-bot.config.ts` in the root directory.')
    }
    const config = (await import(elConfigFile)).default as ElUserConfig
    elConfig = config
  }
  else if (typeof el === 'object') {
    elConfig = el
  }
  else {
    throw new TypeError('`createBot` option must be a string or object')
  }

  return new Bot(elConfig)
}

export class Bot {
  /**
   * 全局配置
   */
  el: ElConfig
  private miraiInstance?: Mirai

  get mirai(): Mirai {
    if (!this.el.mirai)
      throw new Error('This legacy plugin requires explicit mirai configuration')
    return this.miraiInstance ??= new Mirai(this.el.mirai.setting)
  }

  get webhook() {
    return this.server?.webhooks
  }

  // 激活
  active = true
  /**
   * 数据库，默认使用 MongoDB
   */
  db?: mongoose.Connection

  /**
   * node-napcat-ts
   */
  private napcatInstance?: NCWebsocket
  private napcatAdapter?: NapcatAdapter

  /** Lazy compatibility access; WeCom-only bots never construct a NapCat client. */
  get napcat(): NCWebsocket {
    return this.napcatInstance ??= createNapcatClient(this.el.napcat, this.el.debug || this.el.napcat.debug)
  }

  set napcat(client: NCWebsocket) {
    this.napcatInstance = client
  }

  /**
   * qq-guild-bot
   * QQ 官方机器人
   * https://q.qq.com/qqbot/
   * @see https://bot.q.qq.com/wiki/develop/nodesdk/
   */
  qq?: ReturnType<typeof createQQSDK>

  readonly adapters = new AdapterRegistry()
  private running = false
  private starting?: Promise<void>
  private stopping?: Promise<void>
  private readonly handleSignal = () => {
    if (process.stdin.isTTY)
      void this.stop().then(() => process.exit(0))
  }

  /**
   * Server
   */
  server?: BotServer

  /**
   * 状态
   */
  status: Status
  /**
   * 用户系统
   */
  user: User
  /**
   * 发送器
   */
  sender: Sender
  /**
   * 插件系统
   */
  plugins: Plugins
  /**
   * 已安装的插件
   */
  installedPlugins = new Set()
  /**
   * for composition-api
   */
  hooks = createHooks<LiteCycleHook>()

  /**
   * 面向开发者的指令系统
   */
  cli = new CliCommand('el').exitOverride()

  /**
   * 面向用户的指令系统
   */
  _command: Command
  /**
   * 日志系统
   */
  logger = logger
  /**
   * 是否开发模式下
   */
  isDev = process.env.NODE_ENV !== 'production'
  rootDir = process.cwd()
  tmpDir = 'tmp/'

  constructor(el: ElUserConfig) {
    statement()

    setCurrentInstance(this)
    this.el = resolveElConfig(el)
    // const setting = this.el.setting as MiraiApiHttpSetting
    // this.mirai = new Mirai(setting)
    this.status = new Status(this)
    this.user = new User(this)
    this.sender = new Sender(this)
    this.plugins = new Plugins(this)
    this._command = new Command(this)

    this.server = createServer(this.el.server)

    // this.cli = initCli(this, 'el')

    // report error to qq
    if (this.el.report?.enable) {
      const logError = this.logger.error
      this.logger.error = (...args: any) => {
        const target = this.el.report?.target || {}
        if (this.el.bot.devGroup) {
          if (target?.group)
            target.group.push(this.el.bot.devGroup)
          else target.group = [this.el.bot.devGroup]
        }
        // this.sender.sendMessageByConfig(args.join(' '), target)
        return logError(args[0], ...args.slice(1))
      }
    }

    // init qq
    if (this.el.qq)
      this.qq = createQQSDK(this.el.qq)
  }

  /**
   * 机器人当前消息 快捷回复
   */
  reply(message: string | MessageType.MessageChain): ReturnType<Mirai['reply']>
  reply(message: MessageContext, content: string): Promise<unknown>
  reply(rawMsg: NapcatMessage, msg: SendMessageSegment[] | string, quote?: boolean): Promise<unknown> | undefined
  reply(rawMsg: NapcatMessage | MessageContext | string | MessageType.MessageChain, msg?: SendMessageSegment[] | string, quote = false) {
    if (typeof rawMsg === 'string' || Array.isArray(rawMsg)) {
      const current = this.mirai.curMsg
      if (!current)
        throw new Error('No current Mirai message to reply to')
      return this.mirai.reply(rawMsg, current, quote)
    }
    if (msg === undefined)
      throw new Error('Reply content is required')
    if ('adapterId' in rawMsg) {
      if (typeof msg !== 'string')
        throw new Error('Platform replies currently support text content only')
      return rawMsg.reply(msg)
    }
    return replyNapcatMessage(this.napcat, rawMsg, msg, quote)
  }

  /**
   * 启动机器人
   */
  start(): Promise<void> {
    if (this.stopping)
      return this.stopping.then(() => this.start())
    if (this.starting)
      return this.starting
    if (this.running)
      return Promise.resolve()
    this.starting = this.startRuntime().finally(() => {
      this.starting = undefined
    })
    return this.starting
  }

  private async startRuntime() {
    consola.log('')
    consola.debug('Starting el-bot...')

    // 连接数据库
    if (this.el.db?.enable)
      await connectDb(this, this.el.db)

    // reset
    this.hooks.removeAllHooks()
    this.plugins.hasPlatformPlugins = false
    // 加载插件
    consola.log('')
    setCurrentInstance(this)
    await this._command.reloadPlugins(async () => {
      await this.plugins.loadConfig()
      // 自动加载自定义插件
      if (this.el.bot.autoloadPlugins) {
        await this.plugins.loadCustom(this.el.bot.pluginDir)
      }
    })

    consola.log('')
    consola.success('插件加载完成')
    consola.log('')

    const explicitPlatform = this.plugins.hasPlatformPlugins || this.el.bot.plugins.some(plugin => plugin?.platform)
    if (!this.adapters.size && !explicitPlatform && this.el.legacyQQ !== false && !this.el.mirai)
      this.registerAdapter(new NapcatAdapter({ client: this.napcat, onError: handleError }))

    if (this.el.mirai) {
      await this.mirai.link(this.el.mirai.qq)
      this.mirai.listen()
    }
    try {
      await this.adapters.start(message => dispatchAdapterMessage(this, message))
      this.running = true
      process.on('SIGINT', this.handleSignal)
    }
    catch (error) {
      this.adapters.clear()
      this.napcatAdapter = undefined
      throw error
    }
  }

  /**
   * 停止机器人
   */
  stop(): Promise<void> {
    if (this.stopping)
      return this.stopping
    this.stopping = this.stopRuntime().finally(() => {
      this.stopping = undefined
    })
    return this.stopping
  }

  private async stopRuntime() {
    await this.starting?.catch(() => {})
    process.off('SIGINT', this.handleSignal)
    try {
      await this.adapters.stop()
    }
    finally {
      this.adapters.clear()
      this.napcatAdapter = undefined
      this.running = false
    }
    if (this.miraiInstance)
      await this.miraiInstance.release()
    this.server?.close()

    // 关闭数据库连接
    if (this.db) {
      this.db.close()
      this.logger.info('[db] 关闭数据库连接')
    }

    // close koa server
    // if (this.el.webhook && this.el.webhook.enable) {
    //   if (this.server) {
    //     this.server.close()
    //     this.logger.info('[webhook] 关闭 Server')
    //   }
    // }

    this.logger.success('Bye, Master!')
    consola.log('')
  }

  registerAdapter(adapter: BotAdapter) {
    if (isNapcatAdapter(adapter) && this.napcatAdapter && this.napcatAdapter !== adapter)
      throw new Error('Only one NapCat adapter can serve legacy QQ hooks')
    this.adapters.register(adapter)
    if (isNapcatAdapter(adapter)) {
      this.napcat = adapter.client
      this.napcatAdapter = adapter
    }
  }

  send(adapterId: string, target: MessageTarget, content: string) {
    return this.adapters.send(adapterId, target, content)
  }

  /**
   * 加载自定义函数插件（但不注册）
   * 注册请使用 .plugin
   * 与 this.plugin.use() 的区别是此部分的插件将不会显示在插件列表中
   */
  use(plugin: Plugin | PluginInstallFunction, ...options: any[]) {
    const installedPlugins = this.installedPlugins
    if (installedPlugins.has(plugin)) {
      if (this.isDev) {
        this.logger.warn('插件已经被安装')
      }
    }
    else if (plugin && isFunction(plugin)) {
      installedPlugins.add(plugin)
      plugin(this, ...options)
    }
    else if (isFunction(plugin.install)) {
      installedPlugins.add(plugin)
      plugin.install(this, ...options)
    }
    else if (this.isDev) {
      consola.info(plugin)
      this.logger.warn('插件必须是一个函数，或是带有 "install" 属性的对象。')
    }
    return this
  }

  /**
   * 动态注册插件
   * @param name 插件名称
   * @param plugin 插件函数
   * @param options 插件选项
   */
  plugin(name: string, plugin: Plugin | PluginInstallFunction, ...options: any[]) {
    const addedPlugin = isFunction(plugin)
      ? {
          install: plugin,
        }
      : plugin

    this.plugins.add(name, addedPlugin, ...options)
    this.plugins.custom.add({
      name,
    })
  }

  /**
   * 注册指令（面向用户）
   */
  command(name: string) {
    return this._command.command(name)
  }

  /** Execute a user command without sending a QQ message. */
  executeCommand(text: string) {
    return this._command.execute(text)
  }

  /** Get user-facing help without executing an action. */
  getCommandHelp(name?: string) {
    return this._command.getHelp(name)
  }
}
