import { describe, expect, it } from 'vitest'
import { inspectWecomMessage, normalizeWecomMessage } from './normalize'
import { replyOnWecom } from './reply'

function textFrame(overrides: Record<string, unknown> = {}) {
  return {
    cmd: 'aibot_msg_callback',
    headers: { req_id: 'req-1' },
    body: {
      msgid: 'msg-1',
      aibotid: 'bot-1',
      chattype: 'single',
      from: { userid: 'user-1' },
      msgtype: 'text',
      text: { content: 'hello' },
      ...overrides,
    },
  }
}

describe('normalizeWecomMessage', () => {
  it('maps a single-chat text callback to a dm payload', () => {
    expect(normalizeWecomMessage(textFrame())).toEqual({
      source: 'wecom',
      text: 'hello',
      sender: { id: 'user-1' },
      chat: { type: 'dm' },
      msg: { id: 'msg-1' },
    })
  })

  it('maps a group text callback and keeps sender name when WeCom provides it', () => {
    expect(normalizeWecomMessage(textFrame({
      msgid: 'msg-2',
      chattype: 'group',
      chatid: 'chat-9',
      from: { userid: 'user-2', name: 'Ada' },
      text: { content: '@Bot hello' },
    }))).toEqual({
      source: 'wecom',
      text: '@Bot hello',
      sender: { id: 'user-2', name: 'Ada' },
      chat: { type: 'group', id: 'chat-9' },
      msg: { id: 'msg-2' },
    })
  })

  it('omits sender name and group id when they are blank', () => {
    expect(normalizeWecomMessage(textFrame({
      chattype: 'group',
      chatid: '',
      from: { userid: 'user-1', name: '   ' },
    }))).toEqual({
      source: 'wecom',
      text: 'hello',
      sender: { id: 'user-1' },
      chat: { type: 'group' },
      msg: { id: 'msg-1' },
    })
  })

  it.each([
    ['image', { msgtype: 'image', image: { url: 'https://example.invalid/a', aeskey: 'k' } }, 'unsupported-type'],
    ['mixed', { msgtype: 'mixed', mixed: { msg_item: [] } }, 'unsupported-type'],
    ['voice', { msgtype: 'voice', voice: { content: 'transcribed' } }, 'unsupported-type'],
    ['file', { msgtype: 'file', file: { url: 'https://example.invalid/f' } }, 'unsupported-type'],
    ['video', { msgtype: 'video', video: { url: 'https://example.invalid/v' } }, 'unsupported-type'],
    ['empty text', { text: { content: '   ' } }, 'empty-text'],
    ['non-user', { compat_info: { source: 'ai_assistant' } }, 'non-user'],
  ] as const)('ignores %s', (_label, patch, reason) => {
    const frame = textFrame(patch)
    expect(normalizeWecomMessage(frame)).toBeUndefined()
    expect(inspectWecomMessage(frame)).toMatchObject({ action: 'ignore', ignored: { reason } })
  })

  it('skips event callbacks, including enter_chat and disconnect', () => {
    expect(normalizeWecomMessage({
      cmd: 'aibot_event_callback',
      headers: { req_id: 'req-event' },
      body: {
        msgid: 'evt-1',
        msgtype: 'event',
        from: { userid: 'user-1' },
        event: { eventtype: 'enter_chat' },
      },
    })).toBeUndefined()
    expect(inspectWecomMessage({
      cmd: 'aibot_event_callback',
      body: { msgtype: 'event', event: { eventtype: 'disconnected_event' } },
    })).toEqual({ action: 'skip' })
  })
})

describe('replyOnWecom', () => {
  it('does not send an outbound reply in the inbound MVP', () => {
    expect(replyOnWecom).toThrow('phase 2: aibot_respond_msg')
  })
})
