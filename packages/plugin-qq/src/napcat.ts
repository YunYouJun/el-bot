import type { BotAdapter, MessageContext, MessageTarget } from 'el-bot/adapter'
import type { GroupMessage, NCWebsocketOptions, PrivateFriendMessage, PrivateGroupMessage, SendMessageSegment } from 'node-napcat-ts'
import { NCWebsocket, Structs } from 'node-napcat-ts'

export type NapcatMessage = GroupMessage | PrivateFriendMessage | PrivateGroupMessage

export function createNapcatClient(options: NCWebsocketOptions, debug = false) {
  return new NCWebsocket(options, debug)
}

export function isNapcatMessage(value: unknown): value is NapcatMessage {
  return typeof value === 'object' && value !== null && 'message_type' in value
    && (value.message_type === 'private' || value.message_type === 'group')
    && 'message_id' in value && typeof value.message_id === 'number'
    && 'message' in value && Array.isArray(value.message)
    && 'sender' in value && typeof value.sender === 'object' && value.sender !== null
    && 'user_id' in value.sender && typeof value.sender.user_id === 'number'
}

export function replyNapcatMessage(client: NCWebsocket, message: NapcatMessage, content: string | SendMessageSegment[], quote = false) {
  const segments = typeof content === 'string' ? [Structs.text(content)] : [...content]
  if (quote)
    segments.unshift(Structs.reply(message.message_id))
  return message.message_type === 'group'
    ? client.send_group_msg({ group_id: message.group_id, message: segments })
    : client.send_private_msg({ user_id: message.sender.user_id, message: segments })
}

export interface NapcatAdapterOptions {
  id?: string
  client: NCWebsocket
  onError?: (error: unknown) => void
}

export class NapcatAdapter implements BotAdapter {
  readonly transport = 'napcat'
  readonly id: string
  readonly platform = 'qq'
  readonly client: NCWebsocket
  private listener?: (message: NapcatMessage) => void

  constructor(private readonly options: NapcatAdapterOptions) {
    this.id = options.id ?? 'qq:napcat'
    this.client = options.client
  }

  async start(dispatch: (message: MessageContext) => Promise<void>) {
    if (this.listener)
      return
    this.listener = (message) => {
      const group = message.message_type === 'group'
      const context: MessageContext = {
        adapterId: this.id,
        platform: this.platform,
        accountId: String(message.self_id),
        id: String(message.message_id),
        text: message.message.filter(segment => segment.type === 'text').map(segment => segment.data.text).join(''),
        sender: { id: String(message.sender.user_id), name: message.sender.nickname },
        chat: { id: String(group ? message.group_id : message.sender.user_id), type: group ? 'group' : 'dm' },
        addressed: !group || message.message.some(segment => segment.type === 'at' && segment.data.qq === String(message.self_id)),
        raw: message,
        reply: content => replyNapcatMessage(this.client, message, content),
      }
      void dispatch(context).catch(error => this.options.onError?.(error))
    }
    this.client.on('message', this.listener)
    await this.client.connect()
    await this.client.get_version_info()
    await this.client.get_login_info()
  }

  async stop() {
    if (this.listener)
      this.client.off('message', this.listener)
    this.listener = undefined
    await this.client.disconnect()
  }

  send(target: MessageTarget, content: string) {
    const id = Number(target.id)
    if (!/^\d+$/u.test(target.id) || !Number.isSafeInteger(id) || id <= 0)
      return Promise.reject(new Error('QQ targets must be positive numeric IDs'))
    const message = [Structs.text(content)]
    return target.type === 'group'
      ? this.client.send_group_msg({ group_id: id, message })
      : this.client.send_private_msg({ user_id: id, message })
  }
}

/** Plugins and the compatibility bundle can contain separate copies of this class. */
export function isNapcatAdapter(adapter: BotAdapter): adapter is NapcatAdapter {
  return adapter.platform === 'qq' && 'transport' in adapter && adapter.transport === 'napcat'
    && 'client' in adapter && typeof adapter.client === 'object' && adapter.client !== null
}
