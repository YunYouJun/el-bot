import process from 'node:process'
import { createInterface } from 'node:readline'

const send = data => process.stdout.write(`${JSON.stringify(data)}\n`)
let initialized = false
let handshake
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line)
  if (request.method === 'initialized') {
    initialized = true
    return
  }
  if (request.method === 'initialize') {
    handshake = request.params
    send({ id: request.id, result: { userAgent: 'fixture' } })
    return
  }
  if (!initialized)
    process.exit(10)
  if (['thread/start', 'thread/resume', 'thread/fork'].includes(request.method)) {
    send({ id: request.id, result: { thread: { id: request.method === 'thread/fork' ? 'forked-1' : request.params.threadId ?? 'thread-1', cwd: request.params.cwd } } })
  }
  else if (request.method === 'turn/start') {
    send({ method: 'turn/started', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'inProgress' } } })
    send({ id: request.id, result: { turn: { id: 'turn-1' } } })
    send({ id: 'approval-1', method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1', command: 'echo hello' } })
  }
  else if (request.id === 'approval-1') {
    send({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', id: 'answer', text: request.result.decision } } })
    send({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } })
  }
  else if (request.method === 'turn/interrupt') {
    send({ id: request.id, result: {} })
    send({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'interrupted' } } })
  }
  else if (request.method === 'exit') {
    process.exit(1)
  }
  else if (request.method === 'environment') {
    send({ id: request.id, result: { secret: process.env.QQ_BOT_SECRET } })
  }
  else if (request.method === 'codex-home') {
    send({ id: request.id, result: { home: process.env.CODEX_HOME } })
  }
  else if (request.method === 'handshake') {
    send({ id: request.id, result: handshake })
  }
  else if (request.method === 'turn/steer') {
    send({ id: request.id, result: { turnId: request.params.expectedTurnId } })
  }
  else if (request.method === 'review/start') {
    send({ id: request.id, result: { turn: { id: 'review-1' }, reviewThreadId: request.params.threadId } })
    send({ method: 'item/completed', params: { threadId: request.params.threadId, turnId: 'review-1', item: { id: 'review', type: 'exitedReviewMode', review: 'Reviewed changes' } } })
  }
})
