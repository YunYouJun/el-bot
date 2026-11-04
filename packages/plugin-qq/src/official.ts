import type { BotAdapter, MessageContext } from 'el-bot/adapter'
import type { QQCredentials } from 'qq-sdk/official'
import { QQBotClient, QQGateway } from 'qq-sdk/official'

export interface OfficialQQAdapterOptions extends QQCredentials {
  id?: string
  onError?: (error: Error) => void
}

/** Official QQ C2C adapter. Passive replies retain the original message and sequence. */
export class OfficialQQAdapter implements BotAdapter {
  readonly platform = 'qq'
  readonly id: string
  private gateway?: QQGateway
  private readonly client: QQBotClient

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
    })
    await this.gateway.start()
  }

  stop() {
    this.gateway?.stop()
    this.gateway = undefined
  }
}
