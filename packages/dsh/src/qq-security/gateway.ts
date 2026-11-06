import type { Gateway, InteractionHandler, Middleware } from './contracts'
import type { QQSecurity } from './policy'

/** Install before the official plugin registers middleware or starts a transport. */
export function protectGateway(prototype: Gateway, policy: QQSecurity, onBound?: (bot: Gateway) => void, manual?: {
  bind: (bot: Gateway, exact: (target: import('./contracts').Target, text: string) => unknown) => void
  stream: (target: import('./contracts').Target, stream: { cancel: () => void }) => void
  offline: () => void
}): () => void {
  const original = {
    use: prototype.use,
    start: prototype.start,
    on: prototype.on,
    off: prototype.off,
    send: prototype.send,
    sendText: prototype.sendText,
    sendTextWithKeyboard: prototype.sendTextWithKeyboard,
    sendImage: prototype.sendImage,
    sendVideo: prototype.sendVideo,
    sendVoice: prototype.sendVoice,
    sendFile: prototype.sendFile,
  }
  const openStream = prototype.openStream
  const stop = prototype.stop
  for (const method of Object.values(original)) {
    if (typeof method !== 'function')
      throw new Error('QQ SDK does not expose the required security boundaries')
  }
  const admitted = new WeakSet<Gateway>()
  const handlers = new WeakMap<InteractionHandler, InteractionHandler>()
  const matches = (bot: Gateway) => bot.appId === policy.appId
  prototype.use = function (...middleware: Middleware[]) {
    if (matches(this) && !admitted.has(this)) {
      manual?.bind(this, (target, text) => original.send.call(this, { target, content: text, msgType: 0 }))
      original.use.call(this, policy.middleware)
      admitted.add(this)
    }
    return original.use.apply(this, middleware)
  }
  prototype.start = function (...args) {
    if (matches(this) && !admitted.has(this))
      throw new Error('QQ security middleware must be installed before connecting')
    if (matches(this))
      onBound?.(this)
    return original.start.apply(this, args)
  }
  if (stop && manual) {
    prototype.stop = function (...args) {
      if (matches(this))
        manual.offline()
      return stop.apply(this, args)
    }
  }
  prototype.on = function (event, handler) {
    if (!matches(this) || event !== 'interaction')
      return original.on.call(this, event, handler)
    const wrapped: InteractionHandler = async (ctx, interaction) => {
      if (!policy.interaction(interaction)) {
        await this.acknowledgeInteraction(interaction.id, 3).catch(() => {})
        return
      }
      return handler(ctx, interaction)
    }
    handlers.set(handler, wrapped)
    return original.on.call(this, event, wrapped)
  }
  prototype.off = function (event, handler) {
    return original.off.call(this, event, matches(this) ? handlers.get(handler) ?? handler : handler)
  }
  prototype.send = function (options) {
    if (!matches(this))
      return original.send.call(this, options)
    const eventId = (options.extra as { event_id?: string } | undefined)?.event_id
    const text = policy.outbound({ ...options.target, eventId }, options.markdown?.content ?? options.content ?? '')
    // A group response is always text, without buttons, mentions, media or extra API fields.
    return original.send.call(this, options.target.scope === 'group'
      ? { target: options.target, content: text, msgType: 0 }
      : options)
  }
  prototype.sendText = function (target, content) {
    return original.sendText.call(this, target, matches(this) ? policy.outbound(target, content) : content)
  }
  prototype.sendTextWithKeyboard = function (target, content, keyboard) {
    if (matches(this) && target.scope === 'group')
      return this.sendText(target, content)
    if (matches(this))
      policy.outbound(target, content)
    return original.sendTextWithKeyboard.call(this, target, content, keyboard)
  }
  if (openStream && manual) {
    prototype.openStream = function (options) {
      if (matches(this))
        policy.assertAutomatic(options.target)
      const stream = openStream.call(this, options)
      if (matches(this))
        manual.stream(options.target, stream)
      return stream
    }
  }
  for (const method of ['sendImage', 'sendVideo', 'sendVoice', 'sendFile'] as const) {
    prototype[method] = function (target, ...args) {
      if (matches(this))
        policy.assertAutomatic(target)
      if (matches(this) && (target.scope !== 'c2c' || target.targetId !== policy.owner))
        throw new Error('Only the owner private chat may receive tool attachments')
      return original[method].call(this, target, ...args)
    }
  }
  return () => {
    Object.assign(prototype, original)
    if (openStream)
      prototype.openStream = openStream
    if (stop)
      prototype.stop = stop
  }
}
