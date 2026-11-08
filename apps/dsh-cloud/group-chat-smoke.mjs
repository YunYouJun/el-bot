import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// No transport is started. Both SDK sending methods terminate in local stubs.
async function main() {
  const runtime = resolve(process.argv[2] ?? '/opt/dsh-runtime')
  const require = createRequire(join(runtime, 'package.json'))
  const sdkRoot = (require.resolve.paths('@tencent-connect/qqbot-nodejs') ?? []).map(root => join(root, '@tencent-connect/qqbot-nodejs')).find(root => existsSync(join(root, 'dist/index.js')))
  assert.ok(sdkRoot, 'Install the official QQ SDK in the isolated runtime')
  const { QQBot } = await import(pathToFileURL(join(sdkRoot, 'dist/index.js')).href)
  const entry = resolve(process.argv[3] ?? '/opt/el-bot-dsh/dist/qq.mjs')
  const { QQPolicy, QQStateStore, QQTranscript, manualRuntime, protectGateway } = await import(pathToFileURL(entry).href)
  const directory = await mkdtemp(join(tmpdir(), 'group-chat-smoke-'))
  const policy = new QQPolicy({ appId: '123', ownerOpenId: 'owner' }, new QQStateStore(join(directory, 'security.json')), '/groups')
  const transcript = new QQTranscript(join(directory, 'transcript'), peer => policy.allowed('group', peer))
  await transcript.load()
  await transcript.bind('group-a', 'group-session')
  policy.captureInbound = message => transcript.inbound(message)
  const preferences = join(directory, 'preferences.json')
  await writeFile(preferences, JSON.stringify({ sessionIds: { 'qqbot:123:group:group-a': 'group-session' } }))
  const context = { get: () => undefined, sessionController: { list: async () => ({ items: [{ sessionId: 'group-session' }] }) } }
  const manual = manualRuntime(context, policy, directory, preferences, (target, text, handoff, send) => transcript.send(target.targetId, text, handoff, send))
  await manual.controller.initialize()
  const undo = protectGateway(QQBot.prototype, policy, undefined, manual.hooks)
  try {
    const bot = new QQBot({ appId: '123', appSecret: 'offline-fixture', transport: 'websocket' })
    const sent = []
    bot.messageApi.sendRaw = async (scope, targetId, _credentials, body) => {
      sent.push({ scope, targetId, text: body.content, type: body.msg_type })
      return { id: `qq-sent-${sent.length}` }
    }
    bot.messageApi.sendMessage = async (scope, targetId, text) => {
      sent.push({ scope, targetId, text, type: 0 })
      return { id: `qq-sent-${sent.length}` }
    }
    bot.use(async (_context, next) => next())
    manual.controller.online = true
    const target = (await manual.controller.view()).sessions[0]
    await manual.controller.request({ operation: 'begin', target: target.id })
    await bot.handleInboundMessage({ kind: 'group', groupOpenid: 'group-a', senderId: 'owner-qq', senderName: 'Owner QQ', messageId: 'incoming', content: '**incoming literal**', rawEventType: 'GROUP_AT_MESSAGE_CREATE', timestamp: new Date().toISOString() })
    const lease = (await manual.controller.view()).sessions[0].lease
    const text = '  Manual **literal**\nunchanged  '
    const preview = await manual.controller.request({ operation: 'preview', target: target.id, lease: lease.id, text, mode: 'proactive' })
    assert.equal(sent.length, 0)
    await Promise.all([manual.controller.request({ operation: 'send', preview: preview.id }), manual.controller.request({ operation: 'send', preview: preview.id })])
    assert.deepEqual(sent, [{ scope: 'group', targetId: 'group-a', text, type: 0 }])
    const page = await transcript.page('group-session')
    assert.equal(page.messages[0].direction, 'incoming')
    assert.equal(page.messages[0].senderId, 'owner-qq')
    assert.deepEqual(page.messages.slice(1).map(row => [row.direction, row.manual, row.text, row.status]), [['outgoing', true, text, 'sent']])
    await manual.controller.request({ operation: 'end', target: target.id, lease: lease.id })
    assert.throws(() => bot.sendText({ scope: 'group', targetId: 'group-a', msgId: 'incoming' }, 'old automatic output'))
    process.stdout.write(`${JSON.stringify({ realSdk: true, inboundCaptured: true, manualReceiptCaptured: true, exactText: true, deduplicated: true, resumedWithFence: true, offline: true })}\n`)
  }
  finally {
    undo()
    manual.controller.close()
    await transcript.close()
    await rm(directory, { recursive: true, force: true })
  }
}
void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
