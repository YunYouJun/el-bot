import type { GroupMessage, PrivateFriendMessage, PrivateGroupMessage } from 'node-napcat-ts'
import { currentInstance } from './lifecycle'

export type NapcatMessage = GroupMessage | PrivateFriendMessage | PrivateGroupMessage
export type CommonMessage = NapcatMessage

export interface LiteCycleHook {
  onMessage: (msg: NapcatMessage) => void | Promise<void>
  onNapcatMessage: (msg: NapcatMessage) => void | Promise<void>
  onGroupMessage: (msg: GroupMessage) => void | Promise<void>
  onPrivateMessage: (msg: PrivateFriendMessage | PrivateGroupMessage) => void | Promise<void>
  onPrivateFriendMessage: (msg: PrivateFriendMessage) => void | Promise<void>
  onPrivateGroupMessage: (msg: PrivateGroupMessage) => void | Promise<void>
}

/**
 * listen to all message
 * - napcat
 * - TODO: other platform
 * @param handler
 */
export function onMessage(
  handler: (msg: NapcatMessage) => void | Promise<void>,
) {
  // consola.info('onMessage', handler)
  currentInstance?.hooks.addHooks({
    onMessage: handler,
  })
}

/**
 * only listen to napcat message
 * @param handler
 */
export function onNapcatMessage(
  handler: (msg: NapcatMessage) => void | Promise<void>,
) {
  currentInstance?.hooks.addHooks({
    onNapcatMessage: handler,
  })
}

/**
 * listen to private message
 * @param handler
 */
export function onPrivateFriendMessage(
  handler: (msg: PrivateFriendMessage) => void | Promise<void>,
) {
  currentInstance?.hooks.addHooks({
    onPrivateFriendMessage: handler,
  })
}

/**
 * listen to private message
 * @param handler
 */
export function onPrivateGroupMessage(
  handler: (msg: PrivateGroupMessage) => void | Promise<void>,
) {
  currentInstance?.hooks.addHooks({
    onPrivateGroupMessage: handler,
  })
}

export function onPrivateMessage(
  handler: (msg: PrivateFriendMessage | PrivateGroupMessage) => void | Promise<void>,
) {
  currentInstance?.hooks.addHooks({
    onPrivateMessage: handler,
  })
}

/**
 * listen to group message
 * @param handler
 */
export function onGroupMessage(
  handler: (msg: GroupMessage) => void | Promise<void>,
) {
  currentInstance?.hooks.addHooks({
    onGroupMessage: handler,
  })
}
