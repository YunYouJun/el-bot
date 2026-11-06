import type { BotAdapter, MessageContext } from 'el-bot/adapter'
import type { QQCredentials } from 'qq-sdk/official'
import { QQBotClient, QQGateway } from 'qq-sdk/official'

export interface OfficialQQAdapterOptions extends QQCredentials {
  id?: string
  onError?: (error: Error) => void
}

const GROUP_SEEN_LIMIT = 10000

/** Official QQ adapter. Passive replies retain the original chat, message and sequence. */
export class OfficialQQAdapter implements BotAdapter {
  readonly platform = 'qq'
  readonly id: string
  private gateway?: QQGateway
  private readonly client: QQBotClient
  private readonly seenGroups = new Set<string>()

  constructor(private readonly options: OfficialQQAdapterOptions) {
    this.id = options.id ?? `qq:official:${options.appId}`
    this.client = new QQBotClient(options)
  }

  async start(dispatch: (message: MessageContext) => Promise<void>) {
    if (this.gateway)
      return
    this.gateway = new QQGateway(this.client, {
      onError: error => this.options.onError?.(error),
      onMessage: async (message) => {
        let sequence = 0
        await dispatch({
          adapterId: this.id,
          platform: this.platform,
          accountId: this.options.appId,
          id: message.id,
          text: message.content,
          sender: { id: message.author.user_openid },
          chat: { id: message.author.user_openid, type: 'dm' },
          addressed: true,
          raw: message,
          reply: content => this.client.reply(message.author.user_openid, message.id, content, ++sequence),
        })
      },
      onGroupMessage: async (message) => {
        const key = JSON.stringify([message.group_openid, message.id])
        if (this.seenGroups.has(key))
          return
        this.seenGroups.add(key)
        let sequence = 0
        try {
          await dispatch({
            adapterId: this.id,
            platform: this.platform,
            accountId: this.options.appId,
            id: message.id,
            text: message.content,
            sender: { id: message.author.member_openid, name: message.author.username },
            chat: { id: message.group_openid, type: 'group' },
            // Full-message events do not reliably identify mentions of this bot.
            addressed: message.eventType === 'GROUP_AT_MESSAGE_CREATE',
            raw: message.raw,
            reply: content => this.client.replyGroup(message.group_openid, message.id, content, ++sequence),
          })
        }
        catch (error) {
          this.seenGroups.delete(key)
          throw error
        }
        if (this.seenGroups.size > GROUP_SEEN_LIMIT) {
          const oldest = this.seenGroups.values().next().value
          if (oldest !== undefined)
            this.seenGroups.delete(oldest)
        }
      },
    })
    await this.gateway.start()
  }

  stop() {
    this.gateway?.stop()
    this.gateway = undefined
    this.seenGroups.clear()
  }
}
