import type { PersonaImport, PersonaResult } from '@el-bot/persona'
import { Buffer } from 'node:buffer'
import { MobileError } from './http'

export interface MobilePersonaRequest {
  operation: 'list' | 'preview' | 'import' | 'use' | 'disable' | 'update'
  id?: string
  revision?: string
  input?: PersonaImport
}

/** Resolve the installed DSH service per request; never create a second library. */
export interface MobilePersonaService {
  request: (request: MobilePersonaRequest, browser: boolean) => Promise<PersonaResult & { instance: { title: string } }>
}

export function personaRequest(value: Record<string, unknown>): MobilePersonaRequest {
  const invalid = () => new MobileError(400, 'invalid_persona_request')
  const operation = value.operation
  if (operation === 'list' || operation === 'disable')
    return { operation }
  if (operation === 'preview' || operation === 'use' || operation === 'update') {
    if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id)
      || (value.revision !== undefined && (typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision)))) {
      throw invalid()
    }
    return { operation, id: value.id, ...value.revision === undefined ? {} : { revision: value.revision as string } }
  }
  if (operation !== 'import' || !value.input || typeof value.input !== 'object' || Array.isArray(value.input))
    throw invalid()
  const input = value.input as Record<string, unknown>
  if (input.kind === 'text') {
    if (typeof input.name !== 'string' || !input.name || input.name.length > 256 || typeof input.text !== 'string' || !input.text.trim())
      throw invalid()
    if (Buffer.byteLength(input.text, 'utf8') > 32 * 1024)
      throw new MobileError(413, 'persona_too_large')
    return { operation, input: { kind: 'text', name: input.name, text: input.text } }
  }
  if (input.kind === 'url')
    return { operation, input: { kind: 'url', url: httpsURL(input.url) } }
  if (input.kind === 'git') {
    const repository = httpsURL(input.repository)
    if (new URL(repository).search || typeof input.path !== 'string' || !input.path || input.path.length > 512
      || input.path.includes('\\') || input.path.includes(':') || [...input.path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      || input.path.split('/').some(part => !part || part === '.' || part === '..')
      || (input.ref !== undefined && (typeof input.ref !== 'string' || !/^[\w./-]{1,200}$/.test(input.ref) || input.ref.startsWith('-')))) {
      throw invalid()
    }
    return { operation, input: { kind: 'git', repository, path: input.path, ...input.ref === undefined ? {} : { ref: input.ref as string } } }
  }
  // Device callers upload text; a path must never become a server-side file read.
  throw invalid()
}

function httpsURL(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048)
    throw new MobileError(400, 'invalid_persona_request')
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.hash)
      return url.href
  }
  catch {}
  throw new MobileError(400, 'invalid_persona_request')
}
