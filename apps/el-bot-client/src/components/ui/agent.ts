/** Presentation states only; applications own connection and approval policies. */
export type YlfAgentState = 'offline' | 'connecting' | 'ready' | 'working' | 'waiting' | 'error' | 'unknown'
