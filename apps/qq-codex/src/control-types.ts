/** Public control status contains no credentials, user IDs, prompts or task output. */
export interface RuntimeStatus {
  phase: 'stopped' | 'starting' | 'running' | 'stopping' | 'unmanaged'
  pid?: number
  startedAt?: string
  qq: 'disconnected' | 'connecting' | 'connected' | 'webhook'
  codex: 'disconnected' | 'connecting' | 'connected'
  project?: string
  busy: boolean
  task?: { id: string, status: string }
  message?: string
}
