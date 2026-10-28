import type { IgnoredWecomMessage, WecomInboundPayload, WecomMessageDecision } from './types'
import { isRecord } from './util'

function ignored(body: Record<string, unknown>, reason: IgnoredWecomMessage['reason']): WecomMessageDecision {
  return {
    action: 'ignore',
    ignored: {
      msgtype: typeof body.msgtype === 'string' && body.msgtype ? body.msgtype : 'unknown',
      msgid: typeof body.msgid === 'string' && body.msgid ? body.msgid : undefined,
      reason,
    },
  }
}

/**
 * Map one WeCom `aibot_msg_callback` frame to the webhook payload.
 * Only `msgtype: "text"` from a normal user is forwarded.
 * Image, mixed, voice, file, video, events, and assistant/channel callbacks are ignored.
 */
export function inspectWecomMessage(frame: unknown): WecomMessageDecision {
  if (!isRecord(frame) || frame.cmd !== 'aibot_msg_callback' || !isRecord(frame.body))
    return { action: 'skip' }

  const body = frame.body
  if (body.compat_info !== undefined)
    return ignored(body, 'non-user')
  if (body.msgtype !== 'text')
    return ignored(body, 'unsupported-type')
  if (!isRecord(body.text) || typeof body.text.content !== 'string' || body.text.content.trim() === '')
    return ignored(body, 'empty-text')
  if (typeof body.msgid !== 'string' || !body.msgid)
    return ignored(body, 'invalid')
  if (!isRecord(body.from) || typeof body.from.userid !== 'string' || !body.from.userid)
    return ignored(body, 'invalid')
  if (body.chattype !== 'single' && body.chattype !== 'group')
    return ignored(body, 'invalid')

  const sender: WecomInboundPayload['sender'] = { id: body.from.userid }
  if (typeof body.from.name === 'string' && body.from.name.trim())
    sender.name = body.from.name

  const chat: WecomInboundPayload['chat'] = {
    type: body.chattype === 'single' ? 'dm' : 'group',
  }
  if (chat.type === 'group' && typeof body.chatid === 'string' && body.chatid)
    chat.id = body.chatid

  return {
    action: 'forward',
    payload: {
      source: 'wecom',
      text: body.text.content,
      sender,
      chat,
      msg: { id: body.msgid },
    },
  }
}

export function normalizeWecomMessage(frame: unknown): WecomInboundPayload | undefined {
  const decision = inspectWecomMessage(frame)
  return decision.action === 'forward' ? decision.payload : undefined
}

/** Server tells the previous socket that a newer subscription replaced it. */
export function isWecomDisconnect(frame: unknown): boolean {
  if (!isRecord(frame) || frame.cmd !== 'aibot_event_callback' || !isRecord(frame.body))
    return false
  return isRecord(frame.body.event) && frame.body.event.eventtype === 'disconnected_event'
}
