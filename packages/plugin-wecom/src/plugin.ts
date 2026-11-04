import type { AdapterPlugin, BotAdapter, MessageContext, MessageTarget } from 'el-bot/adapter'
import type { WecomBridgeOptions, WecomWebhookBotConfig } from './types'
import { WecomBridge } from './client'
import { sendWecomGroupWebhook } from './group-webhook'

export type WecomPluginOptions = (
  | ({ botType?: 'smart' } & WecomBridgeOptions)
  | WecomWebhookBotConfig
) & { id?: string }

export class WecomSmartAdapter implements BotAdapter {
  readonly platform = 'wecom'
  readonly id: string
  private readonly bridge: WecomBridge
  private dispatch?: (message: MessageContext) => Promise<void>
  private resolveReady?: () => void
  private rejectReady?: (error: Error) => void

  constructor(options: WecomBridgeOptions & { id?: string }) {
    this.id = options.id ?? `wecom:smart:${options.botId}`
    this.bridge = new WecomBridge({
      ...options,
      onReady: () => {
        this.resolveReady?.()
        this.resolveReady = undefined
        this.rejectReady = undefined
        options.onReady?.()
      },
      onError: (error) => {
        this.rejectReady?.(error)
        this.rejectReady = undefined
        this.resolveReady = undefined
        options.onError?.(error)
      },
      onMessage: async (payload, context) => {
        await this.dispatch?.({
          adapterId: this.id,
          platform: this.platform,
          accountId: options.botId,
          id: payload.msg.id,
          text: payload.chat.type === 'group' ? payload.text.replace(/^@\S+\s+/u, '') : payload.text,
          sender: payload.sender,
          chat: { id: payload.chat.id ?? payload.sender.id, type: payload.chat.type },
          addressed: true,
          raw: payload,
          reply: context.reply,
        })
        await options.onMessage?.(payload, context)
      },
    })
  }

  async start(dispatch: (message: MessageContext) => Promise<void>) {
    this.dispatch = dispatch
    await new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
      this.bridge.start()
    })
  }

  stop() {
    this.dispatch = undefined
    this.bridge.stop()
  }

  send(target: MessageTarget, content: string) {
    return this.bridge.sendMessage(target.id, content)
  }
}

export function wecomPlugin(options: WecomPluginOptions): AdapterPlugin {
  return {
    pkg: { name: '@el-bot/plugin-wecom' },
    platform: 'wecom',
    setup(host) {
      if (options.botType !== 'webhook') {
        host.registerAdapter(new WecomSmartAdapter(options))
        return
      }
      host.registerAdapter({
        id: options.id ?? 'wecom:webhook',
        platform: 'wecom',
        start() {},
        stop() {},
        async send(target, content) {
          if (target.type !== 'group' || target.id !== 'bound')
            throw new Error('Group webhooks only send to their bound group; use target { type: "group", id: "bound" }')
          await sendWecomGroupWebhook({
            url: options.groupWebhookUrl,
            message: { msgtype: 'markdown', markdown: { content } },
          })
        },
      })
    },
  }
}

export default wecomPlugin
