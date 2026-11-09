import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
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
  const modern = require('@deepseek-ai/dsh/package.json').version === '0.2.2-rc.1'
  const { createScope } = await load('@deepseek-ai/dsh-scope')
  const { QQBot, mentionGate, historyBuffer, quoteRef, slashCommand } = await load('@tencent-connect/qqbot-nodejs')
  const modulePath = resolve(process.argv[2] ?? '/opt/el-bot-dsh/dist/qq.mjs')
  const qq = await import(pathToFileURL(modulePath).href)
  const { QQPolicy, QQStateStore, protectGateway, manualRuntime } = qq
  const directory = await mkdtemp(join(tmpdir(), 'qq-smoke-'))
  const policy = new QQPolicy({ appId: '123', ownerOpenId: 'owner' }, new QQStateStore(join(directory, 'state.json')), '/work/groups')
  const ctx = new Context()
  ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} })
  const toolsFiber = ctx.plugin(ToolRuntime)
  await toolsFiber.await()
  if (modern) {
    const executor = ctx.plugin(await load('@deepseek-ai/dsh-tool-executor-native'))
    await executor.await()
  }
  const consumer = ctx.plugin({ name: 'qq-offline-consumer', inject: ['tools'], apply() {} })
  await consumer.await()
  ctx.provide('qqWorkspaceGrouping', { watchManager: () => () => {} })
  ctx.provide('loader', { internal: { import: specifier => import(specifier) } })
  ctx.provide('webServer', { register: () => () => {} })
  ctx.provide('connection', { requestRejection: () => 401 })
  ctx.provide('sessionController', { list: async () => ({ items: [] }) })
  ctx.provide('llm', { async* stream() {} })
  const isolatedProfile = join(directory, 'profile')
  await mkdir(isolatedProfile, { recursive: true, mode: 0o700 })
  await writeFile(join(isolatedProfile, 'package.json'), '{}\n')
  await symlink('/opt/dsh-runtime/node_modules', join(isolatedProfile, 'node_modules'))
  const qqFiber = ctx.plugin(qq, { appId: '124', ownerOpenId: 'owner', profileDirectory: isolatedProfile })
  await qqFiber.await()
  assert.equal(ctx.get('qqRuntime')?.mode, 'chat-only')
  await qqFiber.dispose()
  const preferences = join(directory, 'prefs.json')
  await writeFile(preferences, JSON.stringify({ sessionIds: { 'qqbot:123:group:group-a': 'group-test', 'qqbot:123:c2c:owner': 'owner-test' } }))
  const qqRoot = dirname(require.resolve('@tencent-connect/dsh-qqbot/package.json'))
  const { createOutboundHandler } = await import(pathToFileURL(join(qqRoot, 'lib/transport/outbound.js')).href)
  const { IdleEvictor } = await import(pathToFileURL(join(qqRoot, 'lib/session/idle-evictor.js')).href)
  const reminderRecord = {
    sessionId: 'owner-test',
    sessionKey: 'qqbot:123:c2c:owner',
    scope: 'c2c',
    peerId: 'owner',
    agent: { status: 'idle' },
    replyTarget: { scope: 'c2c', targetId: 'owner', msgId: '' },
    lastActivity: Date.now() - 31 * 60_000,
  }
  const reminderBindings = new Map([['owner', reminderRecord]])
  const reminderManager = {
    findBySessionId: id => [...reminderBindings.values()].find(record => record.sessionId === id),
    getOrCreate: async (scope, peer, sender, target) => {
      assert.equal(scope, 'c2c')
      assert.equal(peer, 'owner')
      assert.equal(sender, 'owner')
      assert.deepEqual(target, { scope: 'c2c', targetId: 'owner', msgId: '' })
      reminderBindings.set('owner', reminderRecord)
      return reminderRecord
    },
  }
  const reminderSends = []
  const reminderErrors = []
  const reminderOutbound = createOutboundHandler(reminderManager, {
    sendMarkdown: async (target, text) => {
      reminderSends.push({ target, text })
    },
  }, { textChunkLimit: 1200, streaming: false }, { error: message => reminderErrors.push(message), debug: () => {} })
  const reminderEvent = { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'Offline scheduled reminder' }] } } }
  const evictor = new IdleEvictor(reminderBindings, 30 * 60_000, key => reminderBindings.delete(key))
  evictor.check()
  evictor.dispose()
  reminderOutbound.routeSessionEvent({ header: { id: 'owner-test' } }, reminderEvent)
  assert.equal(reminderSends.length, 0)
  const resolveReminder = qq.ownerScheduleResolver(() => reminderManager, policy, preferences)
  const noHostFallback = async () => {
    throw new Error('Must not restore without a QQ binding')
  }
  assert.equal(await resolveReminder('owner-test', noHostFallback), reminderRecord.agent)
  reminderOutbound.routeSessionEvent({ header: { id: 'owner-test' } }, reminderEvent)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reminderSends.length, 1)
  assert.deepEqual(reminderErrors, [])
  const manual = manualRuntime({ sessionController: { list: async () => ({ items: [] }) } }, policy, directory, preferences)
  await manual.controller.initialize()
  const undo = protectGateway(QQBot.prototype, policy, undefined, manual.hooks)
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
    const pipeline = modern ? new (await load('@deepseek-ai/dsh-tools/pipeline')).ToolExecutionPipeline(ctx) : undefined
    const call = async (agent, name, extra = {}) => {
      const signal = new AbortController().signal
      if (!modern)
        return ctx.tools.execute({ agent, name, callId: `call-${name}`, arguments: {}, signal, ...extra })
      if (extra.parent) {
        const prepared = await pipeline.prepare({ agent, name, callId: `call-${name}`, arguments: {}, signal, ...extra })
        const outcome = prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared
        return pipeline.complete(prepared.exec, outcome)
      }
      const batch = await ctx.tools.execute({ agent, calls: [{ type: 'tool_call', id: `call-${name}`, name, arguments: '{}' }], signal })
      return batch.results[0].result
    }
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
    let streamFrames = 0
    bot.messageApi.sendC2CStreamMessage = async () => {
      streamFrames++
      return { id: 'offline-stream' }
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
    assert.equal(observed.length, 2)
    const firstGroup = observed.length
    await send('group', 'group-a', 'member', 'group-1', '<@123> hello', { refMsgIdx: '42', msgIdx: '7', attachments: [{ url: 'http://127.0.0.1/private' }] })
    await send('group', 'group-b', 'member', 'group-2', '<@123> hello', { refMsgIdx: '7' })
    assert.equal(observed.length, firstGroup + 2)
    assert.equal(observed[firstGroup].quote?.entry?.content, undefined)
    assert.equal(observed[firstGroup + 1].quote?.entry?.content, undefined)
    assert.deepEqual(observed[firstGroup].attachments, [])
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
    // Manual sends use the raw text endpoint only after an owner preview is confirmed.
    await bot.emit('ready')
    const selected = (await manual.controller.view()).sessions.find(row => row.scope === 'group')
    await manual.controller.request({ operation: 'begin', target: selected.id })
    const lease = (await manual.controller.view()).sessions.find(row => row.id === selected.id).lease
    const original = '  Manual 原文\n**literal** <@all>  '
    const preview = await manual.controller.request({ operation: 'preview', target: selected.id, lease: lease.id, text: original, mode: 'proactive' })
    const result = await manual.controller.request({ operation: 'send', preview: preview.id })
    assert.equal(result.status, 'sent')
    assert.equal(sent.at(-1)[3].content, original)
    assert.equal(sent.at(-1)[3].msg_type, 0)
    const count = sent.length
    await manual.controller.request({ operation: 'send', preview: preview.id })
    assert.equal(sent.length, count)
    assert.throws(() => bot.sendText({ scope: 'group', targetId: 'group-a', msgId: 'group-1' }, 'automatic'), /paused/)
    await manual.controller.request({ operation: 'end', target: selected.id, lease: lease.id })
    assert.throws(() => bot.sendText({ scope: 'group', targetId: 'group-a', msgId: 'group-1' }, 'late automatic'), /earlier/)
    const privateChat = (await manual.controller.view()).sessions.find(row => row.scope === 'c2c')
    const stream = bot.openStream({ target: { scope: 'c2c', targetId: 'owner', msgId: 'private' } })
    await manual.controller.request({ operation: 'begin', target: privateChat.id })
    await stream.update('late streaming output')
    assert.equal(streamFrames, 0)
    report.manualRawText = true
    report.manualDedup = true
    report.manualPauseAndResume = true
    report.manualStreamCancellation = true
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
