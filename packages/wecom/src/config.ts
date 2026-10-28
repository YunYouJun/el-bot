import type { WecomConfig } from './types'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { WECOM_DEFAULT_WS_URL } from './types'
import { isRecord } from './util'

export interface LoadWecomConfigOptions {
  env?: NodeJS.ProcessEnv
  cwd?: string
  /** Explicit file path. When omitted, `WECOM_CONFIG` or `./wecom.config.json` is used. */
  configPath?: string
}

const MIN_HEARTBEAT_MS = 1000
const DEFAULT_HEARTBEAT_MS = 30_000

async function exists(file: string) {
  try {
    await access(file)
    return true
  }
  catch {
    return false
  }
}

function pick(envValue: string | undefined, fileValue: unknown): string | undefined {
  if (typeof envValue === 'string' && envValue.trim() !== '')
    return envValue.trim()
  if (typeof fileValue === 'string' && fileValue.trim() !== '')
    return fileValue.trim()
  return undefined
}

function assertUrl(value: string, protocols: string[], label: string) {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new Error(`${label} is not a valid URL`)
  }
  if (!protocols.includes(url.protocol))
    throw new Error(`${label} must use ${protocols.join(' or ')}`)
}

/**
 * Load bridge config from a local JSON file and environment variables.
 * Non-empty environment variables override the file. Secrets are never logged here.
 */
export async function loadWecomConfig(options: LoadWecomConfigOptions = {}): Promise<WecomConfig> {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const requested = options.configPath ?? env.WECOM_CONFIG
  const filePath = requested
    ? path.resolve(cwd, requested)
    : path.join(cwd, 'wecom.config.json')
  const shouldRead = requested ? true : await exists(filePath)

  let file: Record<string, unknown> = {}
  if (shouldRead) {
    if (!await exists(filePath))
      throw new Error(`WeCom config file not found: ${filePath}`)
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(filePath, 'utf8'))
    }
    catch {
      throw new Error('WeCom config file is not valid JSON')
    }
    if (!isRecord(parsed))
      throw new Error('WeCom config file must be a JSON object')
    file = parsed
  }

  const botId = pick(env.WECOM_BOT_ID, file.botId)
  const secret = pick(env.WECOM_BOT_SECRET, file.secret)
  const wsUrl = pick(env.WECOM_WS_URL, file.wsUrl) ?? WECOM_DEFAULT_WS_URL
  const webhookUrl = pick(env.WECOM_WEBHOOK_URL, file.webhookUrl)
  const webhookAuthHeader = pick(env.WECOM_WEBHOOK_AUTH_HEADER, file.webhookAuthHeader) ?? 'Authorization'
  const webhookAuthValue = pick(env.WECOM_WEBHOOK_AUTH_VALUE, file.webhookAuthValue)

  if (!botId || !secret || !webhookUrl || !webhookAuthValue) {
    const missing = [
      botId ? '' : 'botId (WECOM_BOT_ID)',
      secret ? '' : 'secret (WECOM_BOT_SECRET)',
      webhookUrl ? '' : 'webhookUrl (WECOM_WEBHOOK_URL)',
      webhookAuthValue ? '' : 'webhookAuthValue (WECOM_WEBHOOK_AUTH_VALUE)',
    ].filter(item => item !== '')
    throw new Error(`Missing WeCom config: ${missing.join(', ')}`)
  }

  assertUrl(wsUrl, ['ws:', 'wss:'], 'WeCom websocket URL')
  assertUrl(webhookUrl, ['http:', 'https:'], 'Grok webhook URL')

  const heartbeatFile = file.heartbeatIntervalMs === undefined
    ? undefined
    : String(file.heartbeatIntervalMs)
  const heartbeatRaw = pick(env.WECOM_HEARTBEAT_MS, heartbeatFile)
  const heartbeatIntervalMs = heartbeatRaw === undefined ? DEFAULT_HEARTBEAT_MS : Number(heartbeatRaw)
  if (!Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < MIN_HEARTBEAT_MS)
    throw new Error(`WECOM_HEARTBEAT_MS must be an integer >= ${MIN_HEARTBEAT_MS}`)

  return {
    botId,
    secret,
    wsUrl,
    webhookUrl,
    webhookAuthHeader,
    webhookAuthValue,
    heartbeatIntervalMs,
  }
}
