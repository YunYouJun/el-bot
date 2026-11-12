import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

async function main() {
  // Run inside the deployment image. No transport is started, no credentials are read,
  // no model requests are made, and all outbound SDK methods terminate in local stubs.
  const runtimeModules = join(process.env.DSH_SMOKE_RUNTIME ?? '/opt/dsh-runtime', 'node_modules')
  const require = createRequire(join(runtimeModules, '@deepseek-ai/dsh/package.json'))
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
  const visionMessages = []
  let visionRecord
  let visionOutbound
  let visionSend = Promise.resolve()
  let visionSession = 0
  const visionManager = {
    config: { appId: '124', access: { c2cMode: 'allowlist', c2cAllow: ['owner'] } },
    sessionKey: (scope, peer) => `qqbot:124:${scope}:${peer}`,
    findByAgent: agent => visionRecord?.agent === agent ? visionRecord : undefined,
    findBySessionId: id => visionRecord?.sessionId === id ? visionRecord : undefined,
    remove: async () => { visionRecord = undefined },
    async getOrCreate(scope, peerId, _senderId, replyTarget) {
      if (!visionRecord) {
        const sessionId = `vision-${++visionSession}`
        const agent = {
          status: 'idle',
          session: { header: { id: sessionId } },
          followup: (message) => {
            visionMessages.push({ sessionId, message })
            visionOutbound?.routeSessionEvent(agent.session, {
              type: 'assistant/message',
              data: { message: { content: [{ type: 'text', text: message.content.some(x => x.type === 'image') ? '图中有一只猫。' : '它是橙色的。' }] } },
            })
          },
          whenIdle: () => visionSend.catch(() => {}),
        }
        agent.ctx = createScope(consumer.ctx, agent).ctx
        visionRecord = { sessionKey: this.sessionKey(scope, peerId), sessionId, scope, peerId, agent }
      }
      visionRecord.replyTarget = replyTarget
      return visionRecord
    },
  }
  ctx.provide('qqWorkspaceGrouping', { watchManager: (listener) => {
    listener(visionManager)
    return () => {}
  } })
  ctx.provide('loader', { internal: { import: specifier => import(specifier) } })
  ctx.provide('webServer', { register: () => () => {} })
  ctx.provide('connection', { requestRejection: () => 401 })
  ctx.provide('sessionController', { list: async () => ({ items: [] }) })
  ctx.provide('llm', { async* stream() {} })
  const imageRef = { attachmentId: 'offline-attachment' }
  ctx.provide('attachments', { saveImage: async ({ mediaType }) => {
    assert.equal(mediaType, 'image/jpeg')
    return imageRef
  } })
  const isolatedProfile = join(directory, 'profile')
  await mkdir(join(isolatedProfile, 'el-bot-qq'), { recursive: true, mode: 0o700 })
  await writeFile(join(isolatedProfile, 'package.json'), '{}\n')
  await writeFile(join(isolatedProfile, 'el-bot-qq/conversations.json'), JSON.stringify({
    'qqbot:124:group:vision-group': { name: '读图*测试*群' },
  }))
  await writeFile(join(isolatedProfile, 'el-bot-qq/group-images.json'), JSON.stringify({
    version: 1,
    appId: '124',
    owner: 'owner',
    provider: 'vision',
    model: 'image',
    grants: [],
  }))
  await symlink(runtimeModules, join(isolatedProfile, 'node_modules'))
  const qqFiber = ctx.plugin(qq, {
    appId: '124',
    ownerOpenId: 'owner',
    profileDirectory: isolatedProfile,
    groupImageCache: { maxEntries: 2 },
  })
  const fetch = globalThis.fetch
  try {
    await qqFiber.await()
    assert.equal(ctx.get('qqRuntime')?.mode, 'chat-only')
    const qqRoot = dirname(require.resolve('@tencent-connect/dsh-qqbot/package.json'))
    const { handleInbound } = await import(pathToFileURL(join(qqRoot, 'lib/transport/inbound.js')).href)
    const { createOutboundHandler } = await import(pathToFileURL(join(qqRoot, 'lib/transport/outbound.js')).href)
    const { cacheMsgId, getCachedReplyIds } = await import(pathToFileURL(join(qqRoot, 'lib/transport/msgid-cache.js')).href)
    const { ReplyLimiter } = await import(pathToFileURL(join(qqRoot, 'lib/transport/reply-limiter.js')).href)
    const { resolveReplyTarget, sendResolvedMarkdown } = await import(pathToFileURL(join(qqRoot, 'lib/transport/reply-target.js')).href)
    const visionBot = new QQBot({ appId: '124', appSecret: 'offline-fixture', transport: 'websocket' })
    const visionReplies = []
    const acknowledgements = []
    let upstreamInteractions = 0
    let proactiveAllowed = false
    let keyboardAllowed = true
    visionBot.messageApi.sendRaw = async (scope, targetId, _creds, body) => {
      if (body?.keyboard && (!keyboardAllowed || (!body.msg_id && !proactiveAllowed)))
        throw new Error('QQ rejected the card')
      if (body?.event_id)
        assert.match(body.event_id, /^INTERACTION_CREATE:/)
      visionReplies.push({ scope, targetId, body })
      return { id: 'offline-vision-reply' }
    }
    visionBot.messageApi.sendMessage = (scope, targetId, content, creds, opts) => visionBot.messageApi.sendRaw(scope, targetId, creds, { content, msg_id: opts?.msgId, keyboard: opts?.inlineKeyboard })
    visionBot.acknowledgeInteraction = async (id, code) => {
      acknowledgements.push([id, code])
    }
    visionBot.use(mentionGate())
    visionBot.on('interaction', () => {
      upstreamInteractions++
    })
    const outboundErrors = []
    const limiter = new ReplyLimiter({ limit: 4 })
    visionOutbound = createOutboundHandler(visionManager, {
      sendMarkdown: (target, content, options) => {
        return visionSend = sendResolvedMarkdown(visionBot, resolveReplyTarget(target, limiter, true), content, options)
      },
    }, { textChunkLimit: 1200, streaming: false }, { error: message => outboundErrors.push(message), debug: () => {} })
    visionBot.on('message', (inbound) => {
      const { scope, targetId, msgId } = inbound.replyTarget
      cacheMsgId(scope, targetId, msgId)
      return handleInbound(inbound, visionManager, { appId: '124' }, { info() {}, warn() {}, error() {} })
    })
    const deliver = (kind, senderId, messageId, content, extra = {}) => visionBot.handleInboundMessage({
      kind,
      senderId,
      messageId,
      content,
      groupOpenid: kind === 'group' ? 'vision-group' : undefined,
      rawEventType: kind === 'group' ? 'GROUP_AT_MESSAGE_CREATE' : 'C2C_MESSAGE_CREATE',
      timestamp: new Date().toISOString(),
      ...extra,
    })
    const request = (id, target) => deliver('group', 'owner', id, `<@${target}> 给他开读图`, { mentions: [{ member_openid: target }] })
    const buttons = () => visionReplies.findLast(r => r.body?.keyboard)?.body.keyboard.content.rows[0].buttons
    const grantFile = join(isolatedProfile, 'el-bot-qq/group-images.json')
    const grants = async () => JSON.parse(await readFile(grantFile, 'utf8')).grants
    const click = (id, button, identity = {}) => visionBot.emit('interaction', {}, {
      id,
      scene: 'c2c',
      user_openid: 'owner',
      data: { resolved: { button_id: button.id, button_data: button.action.data } },
      ...identity,
    })

    await request('rejected-push', 'first-friend')
    assert.match(JSON.stringify(visionReplies.at(-1)), /\/group-images pending/)
    keyboardAllowed = false
    await deliver('c2c', 'owner', 'plain-fallback', '/group-images pending')
    assert.match(JSON.stringify(visionReplies.at(-1)), /\/group-images confirm [a-f0-9]{16}/)
    keyboardAllowed = true
    await deliver('c2c', 'owner', 'pending-vision', '/group-images pending')
    const [firstConfirm, firstCancel] = buttons()
    assert.equal(visionReplies.at(-1).body.msg_id, 'pending-vision')
    await click('cancel-vision', firstCancel)
    assert.match(visionReplies.at(-1).body.content, /已取消/)
    assert.deepEqual(await grants(), [])

    proactiveAllowed = true
    await request('request-vision', 'friend')
    const [, card, receipt] = visionReplies.slice(-3)
    assert.equal(card.scope, 'c2c')
    assert.equal(card.targetId, 'owner')
    assert.equal(card.body.msg_id, undefined)
    assert.equal(card.body.event_id, undefined)
    assert.match(card.body.markdown.content, /后续追问在本群可见/)
    assert.ok(card.body.markdown.content.includes('**群聊**：读图\\*测试\\*群'))
    assert.match(card.body.markdown.content, /^> 群 ID 尾号：-group · 成员 ID：friend$/m)
    assert.match(card.body.markdown.content, /^> 发起后 10 分钟内有效。$/m)
    assert.equal(receipt.scope, 'group')
    assert.match(receipt.body.content, /已把读图确认卡发到主人私聊/)
    assert.doesNotMatch(JSON.stringify(receipt), /confirm|keyboard/)
    const [confirm] = buttons()
    assert.equal(confirm.render_data.visited_label, '已提交')
    await click('stale-confirm', firstConfirm)
    await click('wrong-user', confirm, { user_openid: 'friend' })
    await click('group-click', confirm, { scene: 'group', group_openid: 'vision-group' })
    assert.deepEqual(await grants(), [])
    assert.deepEqual(acknowledgements.slice(-2), [['wrong-user', 3], ['group-click', 3]])
    assert.equal(upstreamInteractions, 0)
    await visionBot.emit('interaction', {}, { id: 'vendor-approval', scene: 'c2c', user_openid: 'owner' })
    assert.equal(upstreamInteractions, 1)
    await click('real-confirm', confirm)
    assert.deepEqual(acknowledgements.at(-1), ['real-confirm', 0])
    assert.equal(visionReplies.at(-1).body.event_id, 'INTERACTION_CREATE:real-confirm')
    assert.match(visionReplies.at(-1).body.content, /已同意群聊读图授权/)
    assert.match(visionReplies.at(-1).body.content, /读图\*测试\*群/)
    assert.equal(visionReplies.at(-1).scope, 'c2c')
    assert.equal(visionReplies.at(-1).targetId, 'owner')
    await click('replay-confirm', confirm)
    assert.match(visionReplies.at(-1).body.content, /无效/)
    const [{ quoteRevision, ...grant }] = await grants()
    assert.match(quoteRevision, /^[a-f0-9]{32}$/u)
    assert.deepEqual(grant, { group: 'vision-group', member: 'friend', mode: 'group' })
    assert.equal((await grants()).length, 1)
    const downloaded = []
    const expired = new Set()
    const firstURL = 'https://multimedia.nt.qq.com.cn/offline-image'
    const secondURL = 'https://gchat.qpic.cn/offline-image-second'
    const visitorURL = 'https://gchat.qpic.cn/ungranted-sender'
    const cacheDir = join(isolatedProfile, 'el-bot-qq/group-image-cache')
    const cachedPath = url => join(cacheDir, `${createHash('sha256').update(JSON.stringify(['124', 'vision-group', url])).digest('hex')}.img`)
    const awaitCached = async (url) => {
      const path = cachedPath(url)
      for (let attempt = 0; attempt < 100 && !existsSync(path); attempt++)
        await setTimeout(10)
      assert.deepEqual([...await readFile(path)], [255, 216, 255, 217])
    }
    // Stand in for the official token endpoint without sending any network request.
    visionBot.api.getToken = async () => 'offline-token'
    globalThis.fetch = async (url) => {
      downloaded.push(String(url))
      if (expired.has(String(url)))
        return Response.json({ retcode: -5503007, retmsg: 'download url has expired' }, { status: 400 })
      return new Response(Uint8Array.of(255, 216, 255, 217))
    }
    const picture = url => ({ attachments: [{ url, content_type: 'image/jpeg' }] })
    const backgroundPicture = (idx, data = picture(firstURL)) => ({ rawEventType: 'GROUP_MESSAGE_CREATE', raw: data, msgIdx: idx })
    const modelTurnsBeforePhoto = visionMessages.length
    await deliver('group', 'friend', 'authorized-image', '', backgroundPicture('REFIDX_image-first'))
    await awaitCached(firstURL)
    assert.deepEqual(downloaded, [firstURL])
    assert.equal(visionMessages.length, modelTurnsBeforePhoto, 'Caching alone must not send bytes to the model')
    expired.add(firstURL)
    assert.deepEqual(getCachedReplyIds('group', 'vision-group'), [], 'Cold group has no downstream QQ reply target')
    await deliver('group', 'friend', 'ask-about-image', '图里是什么？')
    assert.deepEqual(outboundErrors, [], 'The first vision answer must not be dropped without a passive reply target')
    const assertGroupReply = (msgId, content) => {
      const reply = visionReplies.at(-1)
      assert.deepEqual([reply.scope, reply.targetId, reply.body.msg_id, reply.body.content], ['group', 'vision-group', msgId, content])
    }
    assertGroupReply('ask-about-image', '图中有一只猫。')
    await deliver('group', 'other', 'image-followup', '那是什么颜色？')
    assertGroupReply('image-followup', '它是橙色的。')
    assert.equal(downloaded.length, 1)
    assert.deepEqual(visionMessages.at(-2).message.content[0], { type: 'image', attachment: imageRef })
    assert.equal(visionMessages.at(-2).sessionId, visionMessages.at(-1).sessionId)
    assert.match(visionMessages.at(-1).message.content[0].text, /那是什么颜色/)
    assert.ok(Object.isFrozen(visionMessages.at(-2).message))
    const deniedURL = 'https://gchat.qpic.cn/denied-image'
    await deliver('group', 'other', 'no-image-access', '没授权的图', { raw: picture(deniedURL) })
    assert.equal(downloaded.length, 1)
    const second = picture(secondURL)
    await deliver('group', 'friend', 'second-image', '', backgroundPicture('REFIDX_image-second', second))
    await awaitCached(secondURL)
    await deliver('group', 'other', 'no-borrowed-image', '刚才那张图是什么？')
    assert.equal(downloaded.length, 2)
    await deliver('group', 'friend', 'quote-first-image', '引用的图是什么？', { msgType: 103, refMsgIdx: 'REFIDX_image-first' })
    assertGroupReply('quote-first-image', '图中有一只猫。')
    await deliver('group', 'friend', 'ask-about-second-image', '第二张图是什么？')
    assert.deepEqual(downloaded, [firstURL, secondURL])
    assert.deepEqual(outboundErrors, [])
    assertGroupReply('ask-about-second-image', '图中有一只猫。')

    await deliver('c2c', 'owner', 'grant-owner', '/group-images allow vision-group owner')
    await click('confirm-owner', buttons()[0])
    const memberPicture = picture(visitorURL)
    const oldVisitorURL = 'https://gchat.qpic.cn/old-visitor-photo'
    await deliver('group', 'visitor', 'photo-before-quote-scope', '', backgroundPicture('REFIDX_old_visitor', picture(oldVisitorURL)))
    await deliver('c2c', 'owner', 'enable-owner-quotes', '/group-images quote-others vision-group on')
    assert.match(visionReplies.at(-1).body.markdown.content, /引用他人图片授权/)
    assert.match(visionReplies.at(-1).body.markdown.content, /包括未获读图授权/)
    assert.ok(!(await grants()).find(g => g.member === 'owner').quoteOthersRevision)
    const [confirmOthers] = buttons()
    await click('friend-cannot-confirm-others', confirmOthers, { user_openid: 'friend' })
    assert.ok(!(await grants()).find(g => g.member === 'owner').quoteOthersRevision)
    await click('owner-confirms-others', confirmOthers)
    assert.match((await grants()).find(g => g.member === 'owner').quoteOthersRevision, /^[a-f0-9]{32}$/u)
    const beforeVisitorPhoto = visionMessages.length
    await deliver('group', 'visitor', 'photo-after-quote-scope', '', backgroundPicture('REFIDX_visitor', memberPicture))
    await awaitCached(visitorURL)
    assert.equal(existsSync(cachedPath(firstURL)), false, 'The configured entry limit evicts the oldest photo')
    assert.equal(existsSync(cachedPath(secondURL)), true)
    assert.equal(visionMessages.length, beforeVisitorPhoto)
    expired.add(visitorURL)
    const imageTurns = () => visionMessages.filter(({ message }) => message.content.some(part => part.type === 'image')).length
    const previousImages = imageTurns()
    const quoteVisitor = { msgType: 103, refMsgIdx: 'REFIDX_visitor' }
    await deliver('group', 'friend', 'friend-cannot-quote-visitor', '引用的图是什么？', quoteVisitor)
    await deliver('group', 'visitor', 'visitor-cannot-trigger', '引用的图是什么？', quoteVisitor)
    await deliver('group', 'owner', 'owner-cannot-quote-before-enable', '这张图是什么？', { msgType: 103, refMsgIdx: 'REFIDX_old_visitor' })
    assert.deepEqual(downloaded, [firstURL, secondURL, visitorURL])
    assert.equal(imageTurns(), previousImages)
    await deliver('group', 'owner', 'owner-quotes-visitor', '这张图是什么？', quoteVisitor)
    assert.equal(imageTurns(), previousImages + 1)
    assert.deepEqual(downloaded, [firstURL, secondURL, visitorURL])
    assertGroupReply('owner-quotes-visitor', '图中有一只猫。')
    assert.deepEqual(outboundErrors, [])

    await deliver('c2c', 'owner', 'disable-owner-quotes', '/group-images quote-others vision-group off')
    const ownerGrant = (await grants()).find(g => g.member === 'owner')
    assert.equal(ownerGrant.mode, 'group')
    assert.equal(ownerGrant.quoteOthersRevision, undefined)
    await stat(cachedPath(visitorURL))
    await deliver('group', 'owner', 'owner-cannot-quote-after-disable', '这张图是什么？', quoteVisitor)
    assert.equal(imageTurns(), previousImages + 1, 'A cached file must never bypass revoked quote permission')
    assert.equal(existsSync(cachedPath(deniedURL)), false)
    assert.equal(existsSync(cachedPath(oldVisitorURL)), false)

    const overridesFile = join(isolatedProfile, 'el-bot-qq/group-image-cache-settings.json')
    const overrides = async () => JSON.parse(await readFile(overridesFile, 'utf8')).overrides
    const beforePrivateDenials = visionReplies.length
    await deliver('c2c', 'visitor', 'visitor-cannot-read-cache-settings', '查看群图缓存')
    await deliver('c2c', 'owner', 'quoted-cache-command', '把群图缓存改成 48 小时', { msgType: 103, refMsgIdx: 'quote' })
    assert.equal(visionReplies.length, beforePrivateDenials)
    await deliver('group', 'visitor', 'no-group-cache-settings', '查看群图缓存', { groupOpenid: 'settings-test-group' })
    const groupDenial = visionReplies.at(-1)
    const replyTarget = [groupDenial.scope, groupDenial.targetId, groupDenial.body.msg_id]
    assert.deepEqual(replyTarget, ['group', 'settings-test-group', 'no-group-cache-settings'])
    assert.equal(groupDenial.body.content, '群图缓存仅主人私聊管理。')
    await deliver('c2c', 'owner', 'cache-settings-before', '查看群图缓存')
    assert.match(visionReplies.at(-1).body.content, /时长：24 小时/)
    await deliver('c2c', 'owner', 'request-cache-retention', '把群图缓存改成 48 小时')
    const changeCard = visionReplies.at(-1)
    assert.equal(changeCard.scope, 'c2c')
    assert.equal(changeCard.targetId, 'owner')
    assert.match(changeCard.body.markdown.content, /24 小时 → 48 小时/)
    const [cacheConfirm] = buttons()
    assert.equal(cacheConfirm.render_data.label, '同意修改')
    assert.equal(existsSync(overridesFile), false)
    await click('visitor-cannot-confirm-cache', cacheConfirm, { user_openid: 'visitor' })
    await click('group-cannot-confirm-cache', cacheConfirm, { scene: 'group', group_openid: 'vision-group' })
    assert.equal(existsSync(overridesFile), false)
    assert.deepEqual(acknowledgements.slice(-2), [['visitor-cannot-confirm-cache', 3], ['group-cannot-confirm-cache', 3]])
    await click('owner-confirms-cache', cacheConfirm)
    assert.deepEqual(acknowledgements.at(-1), ['owner-confirms-cache', 0])
    assert.equal(visionReplies.at(-1).body.event_id, 'INTERACTION_CREATE:owner-confirms-cache')
    assert.match(visionReplies.at(-1).body.content, /已生效.*48 小时/)
    assert.deepEqual(await overrides(), { ttlHours: 48 })
    await click('cache-card-replay', cacheConfirm)
    assert.deepEqual(acknowledgements.at(-1), ['cache-card-replay', 3])
    await deliver('c2c', 'owner', 'cache-settings-after', '查看群图缓存')
    assert.match(visionReplies.at(-1).body.content, /时长：48 小时/)
    assert.match(visionReplies.at(-1).body.content, /张数上限：2 张/)

    await deliver('c2c', 'owner', 'request-cache-shrink', '/group-images cache set maxEntries 1')
    assert.match(visionReplies.at(-1).body.markdown.content, /旧缓存会自动清理/)
    await click('owner-confirms-cache-shrink', buttons()[0])
    assert.deepEqual(await overrides(), { ttlHours: 48, maxEntries: 1 })
    for (let attempt = 0; attempt < 100 && existsSync(cachedPath(secondURL)); attempt++)
      await setTimeout(10)
    assert.equal(existsSync(cachedPath(secondURL)), false, 'Tightening the limit prunes the live cache without restarting')
    assert.equal(existsSync(cachedPath(visitorURL)), true)
  }
  finally {
    globalThis.fetch = fetch
    await qqFiber.dispose()
  }
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
  const report = { sdk: false, quotes: false, commands: false, tools: false, monotonicGuard: false, owner: false, groupVisionContext: true, offline: true }
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
