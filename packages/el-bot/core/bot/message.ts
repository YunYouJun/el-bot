import type { Bot } from '.'
import type { MessageContext } from '../adapter'
import type { NapcatMessage } from '../composition-api'
import { isNapcatMessage } from '#plugin-qq'

/** Commands consume matches; all other messages follow the original hook order. */
export async function dispatchNapcatMessage(bot: Bot, message: NapcatMessage, session?: MessageContext) {
  if (await bot._command.handleMessage(message, session))
    return

  if (session)
    await bot.hooks.callHook('onSession', session)

  await bot.hooks.callHook('onMessage', message)
  await bot.hooks.callHook('onNapcatMessage', message)
  switch (message.message_type) {
    case 'private':
      if (message.sub_type === 'friend')
        await bot.hooks.callHook('onPrivateFriendMessage', message)
      else if (message.sub_type === 'group')
        await bot.hooks.callHook('onPrivateGroupMessage', message)
      await bot.hooks.callHook('onPrivateMessage', message)
      break
    case 'group':
      await bot.hooks.callHook('onGroupMessage', message)
      break
  }
}

export async function dispatchAdapterMessage(bot: Bot, message: MessageContext) {
  if (message.platform === 'qq' && isNapcatMessage(message.raw)) {
    await dispatchNapcatMessage(bot, message.raw, message)
    return
  }
  if (await bot._command.handleSession(message))
    return
  await bot.hooks.callHook('onSession', message)
}
