import type { QQGroupDirectory } from './groups'
import type { QQMemberImpressions } from './impressions'
import type { ManualControl } from './manual'
import type { ManualRequest } from './manual-types'
import type { QQSecurity } from './policy'
import type { QQTranscript } from './transcript'
import { ManualError } from './manual-types'

/** Private capability for paired owner devices. Never registered as a model tool. */
export class NativeQQChat {
  constructor(
    private readonly transcript: QQTranscript,
    private readonly manual: ManualControl,
    private readonly groups: QQGroupDirectory,
    private readonly policy: QQSecurity,
    private readonly impressions?: QQMemberImpressions,
  ) {}

  async activity(id: string) {
    const state = await this.manual.view()
    const peer = this.transcript.peer(id)
    const target = peer && this.policy.targetId('group', peer)
    return target && state.deliveries.some(row => row.target === target && row.status === 'pending') ? [{ kind: 'qq-send' }] : []
  }

  clear(id: string) { return this.transcript.clear(id) }

  sources() { return this.transcript.sources() }

  async member(id: string, senderId: string) {
    await this.peer(id)
    if (!/^[\w-]{1,128}$/.test(senderId))
      throw new ManualError(400, 'invalid_request')
    const impression = await this.impressions?.get(senderId)
    return { senderId, ...(impression ? { impression } : {}) }
  }

  private async peer(id: string) {
    let peer = this.transcript.peer(id)
    if (!peer) {
      const binding = await this.groups.sessionPeer(id)
      if (binding?.scope === 'group' && this.policy.allowed('group', binding.peerId)) {
        peer = binding.peerId
        await this.transcript.bind(peer, id)
      }
    }
    if (!peer || !this.policy.allowed('group', peer))
      throw new ManualError(404, 'not_found')
    return peer
  }

  async view(id: string, before?: number) {
    const peer = await this.peer(id)
    const page = await this.transcript.page(id, before)
    const state = await this.manual.view()
    const control = this.groups.isArchived?.(id) || !this.groups.canChat(peer) ? undefined : state.sessions.find(row => row.sessionId === id && row.scope === 'group')
    return { ...page, online: state.online, now: state.now, control, deliveries: control ? state.deliveries.filter(row => row.target === control.id) : [] }
  }

  async request(id: string, input: Record<string, unknown>) {
    const peer = await this.peer(id)
    return this.policy.exclusive('group', peer, async () => {
      const view = await this.view(id)
      if (!view.control)
        throw new ManualError(409, 'stale_session')
      const target = view.control.id
      let command: ManualRequest
      if (input.operation === 'begin')
        command = { operation: 'begin', target, seconds: 600 }
      else if (input.operation === 'end' && typeof input.lease === 'string')
        command = { operation: 'end', target, lease: input.lease }
      else if (input.operation === 'preview' && typeof input.lease === 'string' && typeof input.text === 'string' && (input.mode === 'reply' || input.mode === 'proactive'))
        command = { operation: 'preview', target, lease: input.lease, text: input.text, mode: input.mode }
      else if (input.operation === 'send' && typeof input.preview === 'string')
        command = { operation: 'send', preview: input.preview }
      else throw new ManualError(400, 'invalid_request')
      return this.manual.request(command)
    })
  }
}
