export type { RuntimeStatus } from '../../qq-codex/src/control-types'
export type { ReplyPreferences } from '../../qq-codex/src/preferences-types'
export type LocalProgram = 'codex' | 'qq'
export interface ClientSettings {
  nodePath: string
  cliPath: string
  configPath: string
  credentialsPath: string
  statePath: string
  codexAppPath: string
  qqAppPath: string
}
export type Operation = 'status' | 'start' | 'stop' | 'restart' | 'logs'
