import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

async function main() {
  // Run inside the deployment image. No transport is started, no credentials are read,
  // no model requests are made, and all outbound SDK methods terminate in local stubs.
  const require = createRequire('/opt/dsh-runtime/node_modules/@deepseek-ai/dsh/package.json')
  const load = async (name) => {
    let entry
    try {
      entry = require.resolve(name)
    }
    catch {
      const manifest = (require.resolve.paths(name) ?? []).map(root => join(root, name, 'package.json')).find(path => existsSync(path))
      assert.ok(manifest)
      const pkg = JSON.parse(await readFile(manifest, 'utf8'))
      entry = join(dirname(manifest), pkg.main)
    }
    return import(pathToFileURL(entry).href)
  }
  const { Context } = await load('@deepseek-ai/cordis')
  const { ToolRuntime, defineTool } = await load('@deepseek-ai/dsh-tools')
  const { createScope } = await load('@deepseek-ai/dsh-scope')
  const { QQBot, mentionGate, historyBuffer, quoteRef, slashCommand } = await load('@tencent-connect/qqbot-nodejs')
  const modulePath = resolve(process.argv[2] ?? '/opt/el-bot-dsh/dist/qq-security.mjs')
  const security = await import(pathToFileURL(modulePath).href)
  const { QQSecurity, SecurityStore, protectGateway } = security
  const directory = await mkdtemp(join(tmpdir(), 'qq-security-smoke-'))
  const policy = new QQSecurity({ appId: '123', ownerOpenId: 'owner', groupAllow: ['group-a', 'group-b'] }, new SecurityStore(join(directory, 'state.json')), '/work/groups')
  const ctx = new Context()
  ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} })
  const toolsFiber = ctx.plugin(ToolRuntime)
  await toolsFiber.await()
  const consumer = ctx.plugin({ name: 'qq-security-offline-consumer', inject: ['tools'], apply() {} })
  await consumer.await()
  ctx.provide('qqWorkspaceGrouping', { watchManager: () => () => {} })
  ctx.provide('loader', { internal: { import: specifier => import(specifier) } })
  const securityFiber = ctx.plugin(security, { appId: '124', ownerOpenId: 'owner', groupAllow: [], profileDirectory: '/opt/dsh-runtime' })
  await securityFiber.await()
  assert.equal(ctx.get('qqRuntimeSecurity')?.mode, 'chat-only')
  await securityFiber.dispose()
  const undo = protectGateway(QQBot.prototype, policy)
  const report = { sdk: false, quotes: false, commands: false, tools: false, monotonicGuard: false, owner: false, offline: true }
  try {
    ctx.tools.guard(policy.guard)
    ctx.on('tools/pre-execute', async () => ({ kind: 'allow' }))
    let executions = 0
    const probe = name => defineTool({
      name,
      description: 'Offline authorization probe',
      parameters: {},
      output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'ok' }] },
      execute: async () => {
        executions++
        return 'ok'
      },
    })
    ctx.tools.register(probe('read_private'))
    const groupAgent = { id: 'group-test', status: 'idle', session: { header: { id: 'group-test', cwd: '/work/groups' } } }
    const ownerAgent = { id: 'owner-test', status: 'idle', session: { header: { id: 'owner-test', cwd: '/work/private' } } }
    const groupScope = createScope(consumer.ctx, groupAgent)
    const ownerScope = createScope(consumer.ctx, ownerAgent)
    groupAgent.ctx = groupScope.ctx
    ownerAgent.ctx = ownerScope.ctx
    groupAgent.ctx.tools.restrict({ allow: [] })
    // Scope-local capabilities deliberately survive restrict(): the monotonic guard must still deny them.
    groupAgent.ctx.tools.register(probe('scoped_escape'))
    const call = (agent, name, extra = {}) => ctx.tools.execute({ agent, name, callId: `call-${name}`, arguments: {}, signal: new AbortController().signal, ...extra })
    assert.equal((await call(groupAgent, 'read_private')).isError, true)
    const scoped = await call(groupAgent, 'scoped_escape')
    assert.equal(scoped.isError, true)
    assert.match(scoped.error.message, /chat-only/)
    const nested = await call(groupAgent, 'scoped_escape', { parent: Symbol('nested') })
    assert.equal(nested.isError, true)
    assert.match(nested.error.message, /chat-only/)
    assert.equal(executions, 0)
    report.tools = true
    report.monotonicGuard = true
    assert.equal((await call(ownerAgent, 'read_private')).isError, false)
    assert.equal(executions, 1)
    report.owner = true

    const bot = new QQBot({ appId: '123', appSecret: 'offline-fixture', transport: 'websocket' })
    const sent = []
    bot.messageApi.sendMessage = async (...args) => {
      sent.push(args)
      return { id: 'offline' }
    }
    bot.messageApi.sendRaw = async (...args) => {
      sent.push(args)
      return { id: 'offline' }
    }
    bot.acknowledgeInteraction = async () => {}
    let commands = 0
    const slash = slashCommand({ autoHelp: false, commands: [{ name: 'preset', handler: () => {
      commands++
      return 'unsafe'
    } }] })
    bot.use(historyBuffer({ limit: 6 }), mentionGate(), quoteRef(), slash.middleware)
    assert.equal(bot.getMiddlewares()[0], policy.middleware)
    const observed = []
    bot.on('message', async (inbound) => {
      observed.push({ ...inbound.message, quote: inbound.state.quote })
    })
    const send = async (kind, peer, sender, id, content, extra = {}) => bot.handleInboundMessage({
      kind,
      senderId: sender,
      messageId: id,
      content,
      groupOpenid: kind === 'group' ? peer : undefined,
      rawEventType: kind === 'group' ? 'GROUP_AT_MESSAGE_CREATE' : 'C2C_MESSAGE_CREATE',
      timestamp: new Date().toISOString(),
      ...extra,
    })
    await send('c2c', 'owner', 'owner', 'private', 'private-secret', { msgIdx: '42' })
    await send('c2c', 'stranger', 'stranger', 'denied', 'I am the owner')
    await send('group', 'unknown', 'member', 'denied-group', 'hello')
    await send('group', 'group-a', 'member', 'group-1', '<@123> hello', { refMsgIdx: '42', msgIdx: '7', attachments: [{ url: 'http://127.0.0.1/private' }] })
    await send('group', 'group-b', 'member', 'group-2', '<@123> hello', { refMsgIdx: '7' })
    assert.equal(observed.length, 3)
    assert.equal(observed[1].quote?.entry?.content, undefined)
    assert.equal(observed[2].quote?.entry?.content, undefined)
    assert.deepEqual(observed[1].attachments, [])
    report.quotes = true
    await send('group', 'group-a', 'owner', 'command', '<@123> /preset creator')
    assert.equal(commands, 0)
    assert.equal(sent.length, 1)
    report.commands = true
    let decisions = 0
    bot.on('interaction', async () => {
      decisions++
    })
    await bot.emit('interaction', {}, { id: 'group-button', scene: 'group', group_openid: 'group-a', group_member_openid: 'owner' })
    assert.equal(decisions, 0)
    await bot.emit('interaction', {}, { id: 'owner-button', scene: 'c2c', user_openid: 'owner' })
    assert.equal(decisions, 1)
    report.sdk = true
    process.stdout.write(`${JSON.stringify(report)}\n`)
  }
  finally {
    undo()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
