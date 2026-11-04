import type { WSClient, WsFrameHeaders } from '@wecom/aibot-node-sdk'
import { randomUUID } from 'node:crypto'
import { WecomApiError } from './errors'

/** Retain the incoming frame's request identity; never use a global current message. */
export async function replyOnWecom(client: Pick<WSClient, 'replyStream'>, frame: WsFrameHeaders, content: string): Promise<unknown> {
  try {
    return await client.replyStream(frame, randomUUID(), content, true)
  }
  catch (error) {
    throw new WecomApiError('reply', error)
  }
}
