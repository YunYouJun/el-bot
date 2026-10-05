import process from 'node:process'
import { createInterface } from 'node:readline'

let initialized = false
const tools = [
  { name: 'list_projects', inputSchema: { type: 'object', additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: 'set_thread_title', inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } }, additionalProperties: false } },
]
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  const send = result => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`)
  if (message.method === 'initialize') {
    send({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'desktop-fixture', version: '1' } })
  }
  else if (message.method === 'notifications/initialized') {
    initialized = true
  }
  else if (!initialized) {
    process.exit(1)
  }
  else if (message.method === 'tools/list') {
    send({ tools })
  }
  else if (message.method === 'tools/call') {
    if (message.params._meta.threadId !== 'dedicated-chat')
      process.exit(2)
    send({ content: [{ type: 'text', text: JSON.stringify({ tool: message.params.name, arguments: message.params.arguments, pipe: process.env.CODEX_APP_TOOLS_PIPE_PATH, qqSecret: process.env.QQ_BOT_SECRET }) }] })
  }
})
