import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// Offline: no credentials, transport, agent turns, or model calls.
async function load(owner, dependency) {
  const require = createRequire(`/opt/dsh-runtime/node_modules/@deepseek-ai/${owner}/package.json`)
  return import(pathToFileURL(require.resolve(dependency)).href)
}
async function main() {
  const tools = await load('dsh', '@deepseek-ai/dsh-tools')
  for (const owner of ['dsh-base', 'dsh-sdk-minimal']) {
    const peer = await load(owner, '@deepseek-ai/dsh-tools')
    assert.equal(peer.TOOL_RUNTIME_SCHEDULER, tools.TOOL_RUNTIME_SCHEDULER, `${owner}: scheduler identity must match`)
    assert.equal(peer.ToolRuntime, tools.ToolRuntime, `${owner}: tool module identity must match`)
  }
  const { Context } = await load('dsh', '@deepseek-ai/cordis')
  const ctx = new Context()
  ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} })
  const fiber = ctx.plugin(tools.ToolRuntime)
  await fiber.await()
  try {
    assert.equal(typeof ctx.tools[tools.TOOL_RUNTIME_SCHEDULER]?.prepare, 'function')
    let executions = 0
    const unregister = ctx.tools.register({
      name: 'phone_offline_probe',
      description: 'Offline tool execution probe',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: async () => {
        executions++
        return 'ok'
      },
    })
    const result = await ctx.tools.execute({ name: 'phone_offline_probe', callId: 'offline-probe', arguments: {}, signal: new AbortController().signal })
    assert.equal(result.isError, false)
    assert.equal(result.value, 'ok')
    const deny = ctx.tools.guard(() => 'offline-denied')
    const rejected = await ctx.tools.execute({ name: 'phone_offline_probe', callId: 'offline-denied', arguments: {}, signal: new AbortController().signal })
    assert.equal(rejected.isError, true)
    assert.ok(JSON.stringify(rejected.content).includes('offline-denied'))
    assert.equal(executions, 1)
    deny()
    unregister()
    process.stdout.write('Tool runtime module identity, dispatch and denial: passed (offline)\n')
  }
  finally { await fiber.dispose() }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
