import type mongoose from 'mongoose'
import type { ElConfig, ElUserConfig } from '../config/el'
// type
import type { Plugin, PluginInstallFunction } from './plugins/class'
import path from 'node:path'
import process from 'node:process'
import consola from 'consola'
import fs from 'fs-extra'
import { createHooks } from 'hookable'
import { NCWebsocket, Send, Structs } from 'node-napcat-ts'

import colors from 'picocolors'
import { createOpenAPI } from 'qq-guild-bot'
import yargs from 'yargs'
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
import { Command } from './command'
import { logger } from './logger'
import { createQQSDK, QQWebsocketClient } from './platform'
import { Plugins } from './plugins'
import { Sender } from './sender'
import { Status } from './status'
import { User } from './user'

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
  // mirai: MiraiInstance
  // 激活
  active = true
  /**
   * 数据库，默认使用 MongoDB
   */
  db?: mongoose.Connection

  /**
   * node-napcat-ts
   */
  napcat: NCWebsocket
  /**
   * qq-guild-bot
   * QQ 官方机器人
   * https://q.qq.com/qqbot/
   * @see https://bot.q.qq.com/wiki/develop/nodesdk/
   */
  qq?: {
    client: ReturnType<typeof createOpenAPI>
    ws: QQWebsocketClient
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
  cli = yargs()
    .scriptName('el')
    .usage('Usage: $0 <command> [options]')
    .version()
    .alias('h', 'help')
    .alias('v', 'version')
    .help()

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

    // init napcat
    const napcatConfig = this.el.napcat
    this.napcat = new NCWebsocket(napcatConfig, this.el.debug || napcatConfig.debug)

    // init qq
    if (this.el.qq)
      this.qq = createQQSDK(this.el.qq)
  }

  /**
   * 机器人当前消息 快捷回复
   */
  reply(rawMsg: NapcatMessage, msg: Send[keyof Send][] | string, quote = false) {
    const napcat = this.napcat

    // 文本消息
    if (typeof msg === 'string') {
      msg = [Structs.text(msg)]
    }

    // 引用消息
    if (quote) {
      msg.unshift(Structs.reply(rawMsg.message_id))
    }

    if (rawMsg.sender.user_id) {
      // 私聊
      if (rawMsg.message_type === 'private') {
        return napcat.send_private_msg({
          user_id: rawMsg.sender.user_id,
          message: msg,
        })
      }
      // 群聊
      else if (rawMsg.message_type === 'group') {
        return napcat.send_group_msg({
          group_id: rawMsg.group_id,
          message: msg,
        })
      }
    }
  }

  /**
   * 启动机器人
   */
  async start() {
    consola.log('')
    consola.debug('Starting el-bot...')

    // 连接数据库
    if (this.el.db?.enable)
      await connectDb(this, this.el.db)

    try {
      await this.napcat.connect()
      const data = await this.napcat.get_version_info()
      consola.success(`${data.app_name} ${colors.yellow(data.app_version)} ${colors.cyan(data.protocol_version)} connected!`)
    }
    catch (err: any) {
      consola.error('NapCat by SDK 连接失败')
      handleError(err)
    }

    // get login info
    try {
      const data = await this.napcat.get_login_info()
      consola.info('当前登录账号:', `${colors.yellow(data.nickname)}(${colors.cyan(data.user_id)})`)
    }
    catch (err) {
      handleError(err)
    }

    // reset
    this.hooks.removeAllHooks()
    // 加载插件
    consola.log('')
    setCurrentInstance(this)
    await this.plugins.loadConfig()
    // 自动加载自定义插件
    if (this.el.bot.autoloadPlugins) {
      await this.plugins.loadCustom(this.el.bot.pluginDir)
    }

    consola.log('')
    consola.success('插件加载完成')
    consola.log('')

    // 监听并解析用户指令
    this._command.listen()

    // onMessage
    this.napcat.on('message', async (msg) => {
      await this.hooks.callHook('onMessage', msg)
      await this.hooks.callHook('onNapcatMessage', msg)

      switch (msg.message_type) {
        case 'private':
          await this.hooks.callHook('onPrivateFriendMessage', msg)
          await this.hooks.callHook('onPrivateGroupMessage', msg)
          await this.hooks.callHook('onPrivateMessage', msg)
          break
        case 'group':
          await this.hooks.callHook('onGroupMessage', msg)
          break
      }
    })

    // 如何解决持久运行
    // 意外退出
    process.on('SIGINT', () => {
      /**
       * 如果程序在前台运行（即，process.stdin.isTTY 为 true），那么它会在收到 SIGINT 信号时退出。如果程序在后台运行（即，process.stdin.isTTY 为 false），那么它会忽略 SIGINT 信号。
       */
      if (process.stdin.isTTY) {
        this.stop()
        process.exit(0)
      }
    })
  }

  /**
   * 停止机器人
   */
  async stop() {
    this.napcat.disconnect()

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
}
