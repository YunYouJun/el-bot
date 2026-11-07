import type { IncomingMessage, ServerResponse } from 'node:http'

export interface Device {
  id: string
  name: string
  createdAt: string
  expiresAt: string
}

export interface SessionSource {
  platform: 'qq'
  kind: 'direct' | 'group'
  appId?: string
  peerId?: string
  name?: string
  description?: string
  category?: string
  tags?: string[]
  memberCount?: number
  groupInfoStatus?: 'available' | 'forbidden' | 'unavailable'
  botStateStatus?: 'available' | 'forbidden' | 'unavailable'
  bot?: { joinedAt?: string, role?: string, receiveMode?: string, allowProactive?: boolean }
  lastMessage?: {
    id: string
    senderId: string
    senderName?: string
    senderRole?: string
    senderIsBot?: boolean
    text: string
    createdAt: string
    type: string
  }
}

export interface SessionSummary {
  id: string
  title: string
  updatedAt: string
  running: boolean
  blank?: boolean
  archived?: boolean
  readOnly?: boolean
  workspace?: string
  source?: SessionSource
  provider?: string
  model?: string
  context?: SessionContext
}

export interface SessionContext {
  usedTokens?: number
  contextWindow?: number
  usageSource?: 'projected' | 'last-request'
  policy?: SessionContextPolicy
}

export interface SessionContextPolicy {
  automatic: boolean
  thresholdRatio: number
  headroomTokens: number
  retainRatio?: number
  retainTokens?: number
  source: 'active' | 'preset'
  preset?: string
}

export interface BotGroup {
  id: string
  source: SessionSource
  membership: 'joined' | 'left' | 'unknown'
  allowed: boolean
  sessionId?: string
}

export interface ModelRoute {
  provider: string
  model: string
  reasoningEffort?: string
}

export interface ModelOption {
  id: string
  name: string
  description?: string
}

export interface ModelProviderGroup {
  id: string
  name: string
  models: ModelOption[]
}

export interface SessionModelCatalog {
  current?: ModelRoute
  groups: ModelProviderGroup[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
  requestId?: string
}

export interface Conversation {
  session: SessionSummary
  messages: ChatMessage[]
  hasMore: boolean
  cursor: number
}

export interface BotStatus {
  name: string
  appId: string
  state: 'online' | 'offline' | 'connecting' | 'unknown'
  checkedAt: string
  runtime?: RemoteRuntimeStatus
  host?: RemoteHostStatus
}

/** Metrics sampled on the Linux host, outside the bot container. */
export interface RemoteHostStatus {
  sampledAt: string
  stale: boolean
  hostname: string
  cpu: { count: number, usagePercent: number, sampleSeconds: number }
  memory: { totalBytes: number, usedBytes: number, availableBytes: number, usagePercent: number }
  disks: { mountPoint: string, totalBytes: number, usedBytes: number, availableBytes: number, usagePercent: number }[]
}

/** The API process environment; in Docker this describes the container. */
export interface RemoteRuntimeStatus {
  hostname: string
  platform: string
  release: string
  arch: string
  nodeVersion: string
  cpuCount: number
  uptimeSeconds: number
  memoryRSSBytes: number
}

/** Conversation and status capabilities of the paired companion API. */
export interface MobileHost {
  archive?: (id: string, archived: boolean, signal: AbortSignal) => Promise<void>
  delete?: (id: string, signal: AbortSignal) => Promise<void>
  groups?: (signal: AbortSignal) => Promise<BotGroup[]>
  openGroup?: (id: string, signal: AbortSignal) => Promise<string>
  list: (signal: AbortSignal) => Promise<SessionSummary[]>
  information?: (id: string, signal: AbortSignal) => Promise<SessionSummary>
  conversation: (id: string, signal: AbortSignal, before?: number) => Promise<Conversation>
  models: (id: string, signal: AbortSignal) => Promise<SessionModelCatalog>
  selectModel: (id: string, route: ModelRoute, signal: AbortSignal) => Promise<ModelRoute>
  prompt: (id: string, text: string, requestId: string, signal: AbortSignal) => Promise<void>
  create: (requestId: string) => Promise<string>
  status: () => Promise<BotStatus>
}

export interface MobileContext {
  tools: import('./phone').PhoneTools
  get?: (name: string) => unknown
  connection: { authenticatedUrl: (baseUrl: string) => string }
  webServer: {
    getOrigin: () => string
    register: (route: { kind: 'prefix', path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) => () => void
  }
  sessionController: unknown
  workspaceRegistry: unknown
  effect: (install: () => Promise<() => Promise<void>>) => unknown
}

export interface MobileSettings {
  phone?: { enabled: boolean }
  web?: { enabled: boolean, port?: number }
  profileDirectory?: string
  publicBaseUrl: string
  appId?: string
  botName?: string
  workspaceDirectory?: string
  hostMetricsFile?: string
  account?: {
    cloudbaseEnvId?: string
    appId?: string
    clientId?: string
    issuer?: string
    jwksUrl?: string
    requiredScope?: string
    requireVerifiedPhone?: boolean
  }
  discovery?: {
    account?: {
      cloudbaseEnvId?: string
      appId?: string
      clientId?: string
      issuer?: string
      jwksUrl?: string
      requiredScope?: string
      requireVerifiedPhone?: boolean
    }
    enrollmentSecret?: string
    instances?: unknown[]
    tickets?: {
      issue: (proof: { accessToken: string, identityAssertion: string, nonce: string }, instances: unknown[], deviceName: string) => Promise<Record<string, string>>
      sign: (userId: string, instance: unknown, deviceName: string, clientId?: string) => Promise<string>
    }
  }
}
