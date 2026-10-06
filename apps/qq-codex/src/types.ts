import type { DesktopOptions, RpcRequest } from '@el-bot/codex'
import type { C2CMessage, QQMarkdownReply } from 'qq-sdk/official'
import type { CardRenderOptions, ImageCard, ImageCardDetails, ImageHelpCommand } from './card-renderer'

/** Explicit path overrides accepted by every CLI command. */
export interface PathOptions {
  profile?: string
  config?: string
  state?: string
  envFile?: string
}

/** Resolved local configuration, credentials and state filenames. */
export interface CliPaths {
  profile?: string
  codexHome?: string
  config: string
  state: string
  envFile: string
}

/** Options for non-destructive first-run setup. */
export interface InitOptions {
  project?: string
  name?: string
  prompt: boolean
}

/** QQ bot credentials, kept out of logs and persisted task state. */
export interface BotCredentials {
  appId: string
  secret: string
}

export interface RemoteConfig {
  projects: Record<string, string>
  defaultProject: string
  ownerOpenId?: string
  codexExecutable?: string
  codexHome?: string
  codexConnection?: 'stdio' | 'desktop'
  codexEnvAllowlist?: string[]
  codexSocket?: string
  experimentalApi?: boolean
  management?: { enabled: boolean, allowedMethods: string[] }
  desktop?: DesktopOptions
  model?: string
  transport: 'websocket' | 'webhook'
  webhookPort: number
  sandbox: boolean
  messageFormat: 'markdown' | 'text' | 'image'
  image?: ImageOptions
}
export interface ImageOptions extends CardRenderOptions {
  /** Local QQ uploads are the default; public hosting remains an optional transport. */
  transport?: 'upload' | 'public'
  /** Required only for public transport, forwarded to /qq-codex/images. */
  publicBaseUrl?: string
}
export interface CardImagePublisher {
  kind?: 'media' | 'markdown'
  publish: (card: ReplyCard, openId: string) => Promise<CardImagePublished>
}
export type CardImagePublished = { width: number, height: number } & ({ url: string } | { media: { file_info: string } })
export type TaskStatus
  = 'starting' | 'running' | 'completed' | 'interrupted' | 'failed'
/** Minimal RPC surface needed for local account and model preflight checks. */
export interface CodexReadinessClient {
  request: (method: string, params: unknown) => Promise<unknown>
}
/** Stable categories only; raw provider errors and credentials are never persisted. */
export type FailureCode
  = 'authentication' | 'model' | 'session-archived' | 'session-missing'
    | 'project-changed' | 'quota' | 'rate-limit' | 'context' | 'network'
    | 'timeout' | 'connection' | 'stop-unconfirmed' | 'unknown'
export interface FailureMessage {
  summary: string
  hint: string
}
export interface Task {
  id: string
  project: string
  threadId?: string
  turnId?: string
  status: TaskStatus
  output: string
  createdAt: string
  failure?: FailureCode
}
export interface RemoteState {
  version: 1
  instance?: InstanceIdentity
  owner?: string
  project: string
  threads: Record<string, { id: string, cwd: string }>
  seen: string[]
  tasks: Task[]
}

/** Local instance identity; contains no credentials or personal account data. */
export interface InstanceIdentity {
  appId: string
  sandbox: boolean
  profile?: string
  codexHome?: string
}

export interface SessionCheck {
  project: string
  status: 'ready' | 'new' | 'archived' | 'missing' | 'project-changed' | 'unavailable'
}

/** Fixed, credential-free diagnostic results suitable for humans and AI setup. */
export interface DiagnosticCheck {
  id: string
  status: 'pass' | 'fail' | 'skip'
  summary: string
  actions?: string[]
}

export interface DiagnosticReport {
  version: 1
  ok: boolean
  checks: DiagnosticCheck[]
}

export interface DiagnosticOptions {
  paths: CliPaths
  includeCodex: boolean
  includeQQ: boolean
  loadConfig: () => Promise<RemoteConfig>
  loadCredentials: () => Promise<BotCredentials>
}
export interface PendingApproval {
  token: string
  request: RpcRequest
  pages: string[]
  viewed: Set<number>
  kind: 'approval' | 'input'
  timer: ReturnType<typeof setTimeout>
}
export interface ReplyContext {
  message: C2CMessage
  sequence: number
  outbox?: Promise<boolean>
}

/** A rendered card with a lossless text fallback for the same content page. */
export interface ReplyCard {
  text: string
  payload: QQMarkdownReply
  /** Keep approval details selectable and available even when an image cannot load. */
  imageAllowed?: boolean
  visual?: ImageCard
}

/** A command button; its data is always generated from trusted controller state. */
export interface CommandButton {
  label: string
  command: string
  tone?: 'primary' | 'secondary' | 'danger'
  enter?: boolean
  confirmation?: string
}

/** A fixed documentation destination, never taken from model output. */
export interface LinkButton {
  label: string
  url: string
  tone?: 'primary' | 'secondary'
}

export type CardButton = CommandButton | LinkButton

/** Trusted labels and literal values displayed above a card's body. */
export interface CardDetails extends ImageCardDetails {
  links?: LinkButton[]
}

export type HelpCommand = ImageHelpCommand

/** Fixed command documentation; user output never supplies menu actions. */
export interface HelpPage {
  title: string
  body: string
  commands: HelpCommand[]
  intro?: string
  notes: string[]
}
