import process from 'node:process'
import { createInterface } from 'node:readline'

const mode = process.argv[2] ?? 'resume'
const sessions = new Map([['saved', process.cwd()]])
let prompt
const send = value => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...value })}\n`)
const reply = (id, result) => send({ id, result })
const chunk = text => send({ method: 'session/update', params: { sessionId: prompt.params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } } })
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  const { id, method, params } = message
  if (method === 'initialize') {
    if (params.clientCapabilities.terminal || params.clientCapabilities.fs.writeTextFile)
      throw new Error('Client advertised unrestricted tools')
    reply(id, { protocolVersion: mode === 'version' ? 2 : 1, agentCapabilities: mode === 'load' ? { loadSession: true } : { sessionCapabilities: { list: {}, resume: {}, close: {} } } })
  }
  else if (method === 'session/list') {
    reply(id, { sessions: [...sessions].map(([sessionId, cwd]) => ({ sessionId, cwd })) })
  }
  else if (method === 'session/new') {
    sessions.set('new-session', params.cwd)
    reply(id, { sessionId: 'new-session', configOptions: [{ id: 'model', category: 'model', type: 'select', options: [{ value: 'fixture-model', name: 'Fixture' }] }] })
  }
  else if (method === 'session/load' || method === 'session/resume') {
    if (mode === 'load' && method !== 'session/load')
      throw new Error('Wrong resume method')
    if (!sessions.has(params.sessionId) || sessions.get(params.sessionId) !== params.cwd) {
      send({ id, error: { code: -32602, message: 'private provider message' } })
    }
    else {
      send({ method: 'session/update', params: { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'HISTORICAL OUTPUT' } } } })
      reply(id, {})
    }
  }
  else if (method === 'session/set_config_option') {
    if (params.value !== 'fixture-model')
      send({ id, error: { code: -32602, message: 'private model error' } })
    else reply(id, {})
  }
  else if (method === 'session/prompt') {
    prompt = message
    if (params.prompt[0].text === 'wait' || params.prompt[0].text === 'hang')
      return
    if (params.prompt[0].text === 'error') {
      send({ id, error: { code: -32602, message: 'API_KEY=private-secret' } })
      prompt = undefined
      return
    }
    if (params.prompt[0].text === 'malformed') {
      process.stdout.write('not-json\n')
      return
    }
    chunk('你好\n')
    send({ id: 'permission', method: 'session/request_permission', params: {
      sessionId: mode === 'cross-session' ? 'other-session' : params.sessionId,
      toolCall: { toolCallId: 'tool', title: 'Edit src/index.ts', kind: 'edit', content: [{ type: 'diff', path: 'src/index.ts', oldText: 'old', newText: 'new' }] },
      options: mode === 'always' ? [{ optionId: 'always', kind: 'allow_always' }] : [{ optionId: 'once', kind: 'allow_once' }, { optionId: 'always', kind: 'allow_always' }],
    } })
  }
  else if (id === 'permission' && !method) {
    chunk(message.result.outcome.outcome === 'selected' ? `approved:${message.result.outcome.optionId}` : 'denied')
    reply(prompt.id, { stopReason: 'end_turn' })
    prompt = undefined
  }
  else if (method === 'session/cancel' && prompt) {
    if (prompt.params.prompt[0].text === 'hang')
      return
    reply(prompt.id, { stopReason: 'cancelled' })
    prompt = undefined
  }
  else if (method === 'session/close') {
    reply(id, {})
  }
  else {
    send({ id, error: { code: -32601, message: 'Unknown fixture method' } })
  }
})
