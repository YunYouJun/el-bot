import type { Bot } from '.'
import type { NapcatMessage } from '../composition-api'

/** Commands consume matches; all other messages follow the original hook order. */
export async function dispatchNapcatMessage(bot: Bot, message: NapcatMessage) {
  if (await bot._command.handleMessage(message))
    return

  await bot.hooks.callHook('onMessage', message)
  await bot.hooks.callHook('onNapcatMessage', message)
  switch (message.message_type) {
    case 'private':
      await bot.hooks.callHook('onPrivateFriendMessage', message)
      await bot.hooks.callHook('onPrivateGroupMessage', message)
      await bot.hooks.callHook('onPrivateMessage', message)
      break
    case 'group':
      await bot.hooks.callHook('onGroupMessage', message)
      break
  }
}
