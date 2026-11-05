import type { PersonaResult } from '../../persona/src/types'

export interface DshPersonaResult extends PersonaResult {
  instance: { title: string, profile: string }
  runtime?: { managedSessions: number, pendingSessions: number, attachedBots: number }
}
