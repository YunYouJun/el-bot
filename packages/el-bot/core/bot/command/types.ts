import type { SendMessageSegment } from 'node-napcat-ts'
import type { Bot } from '..'
import type { NapcatMessage } from '../../composition-api'

export type CommandReply = string | SendMessageSegment[]
export type CommandResult = CommandReply | void

export interface CommandContext {
  bot: Bot
  source: 'message' | 'programmatic'
  message?: NapcatMessage
  /** Bound to this invocation; rejects when no incoming message is available. */
  reply: (content: CommandReply, quote?: boolean) => Promise<unknown>
}

export type CommandAction = (args: string[], context: CommandContext) => CommandResult | Promise<CommandResult>

export type CommandExecution
  = | { matched: false }
    | { matched: true, result: CommandResult }
