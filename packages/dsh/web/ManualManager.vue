<script setup lang="ts">
import type { Delivery, ManualPreview, ManualRequest, ManualStateView, SendMode } from '../src/qq-security/manual-types'
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { manualErrors } from '../src/qq-security/manual-types'

const state = shallowRef<ManualStateView>()
const selected = ref('')
const seconds = ref(600)
const text = ref('')
const mode = ref<SendMode>('proactive')
const preview = shallowRef<ManualPreview>()
const busy = ref(false)
const error = ref('')
const notice = ref('')
const clock = ref(Date.now())
let offset = 0
const session = computed(() => state.value?.sessions.find(row => row.id === selected.value))
const lease = computed(() => session.value?.lease && session.value.lease.expiresAt > clock.value + offset ? session.value.lease : undefined)
const remaining = computed(() => Math.max(0, Math.ceil(((lease.value?.expiresAt ?? 0) - clock.value - offset) / 1000)))
const ready = computed(() => !!state.value?.online && lease.value?.phase === 'active' && !busy.value)
const receipts = computed(() => state.value?.deliveries.filter(row => row.target === selected.value) ?? [])
const permission = computed(() => session.value?.proactivePermission === 'allowed' ? '最近一次主动发送成功' : session.value?.proactivePermission === 'denied' ? 'QQ 已拒绝主动发送' : '主动发送权限待回执核验')

async function request(input: ManualRequest) {
  const response = await fetch('/el-bot/manual/api', {
    method: input.operation === 'list' ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: input.operation === 'list' ? {} : { 'content-type': 'application/json', 'x-el-bot-manual': '1' },
    body: input.operation === 'list' ? undefined : JSON.stringify(input),
  })
  const data = await response.json()
  if (!response.ok || !data.ok) {
    if (['preview_expired', 'lease_expired', 'stale_session', 'reply_expired'].includes(data.code))
      preview.value = undefined
    throw new Error(data.error ?? '无法连接机器人，请重新登录 DSH。')
  }
  return data.result
}

async function refresh() {
  const result = await request({ operation: 'list' }) as ManualStateView
  const previous = session.value?.lease
  const current = result.sessions.find(row => row.id === selected.value)?.lease
  if (previous && !current)
    notice.value = previous.expiresAt <= result.now ? '接管已到时，自动回复已恢复。' : '接管已结束，自动回复已恢复。'
  offset = result.now - Date.now()
  clock.value = Date.now()
  state.value = result
  if (preview.value) {
    const receipt = result.deliveries.find(row => row.id === preview.value?.id)
    if (receipt?.status === 'sent' || receipt?.status === 'failed') {
      if (receipt.status === 'sent' && text.value === preview.value.text)
        text.value = ''
      preview.value = undefined
    }
  }
  if (!selected.value || !result.sessions.some(row => row.id === selected.value))
    selected.value = result.sessions[0]?.id ?? ''
}

async function perform(input: ManualRequest) {
  if (busy.value)
    return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    let result = await request(input)
    if (input.operation === 'preview' || input.operation === 'send') {
      if (input.operation === 'preview') {
        const prepared = result as ManualPreview
        if (prepared.text !== input.text || prepared.target !== input.target || prepared.mode !== input.mode)
          throw new Error('发送内容或目标已变化，请刷新后重试。')
        preview.value = prepared
        result = await request({ operation: 'send', preview: prepared.id })
      }
      const receipt = result as Delivery
      notice.value = receipt.status === 'sent' ? 'QQ 已确认发送成功。原文未经过模型。' : receipt.status === 'pending' ? '发送中，请刷新查看结果，不要重复新建发送。' : receipt.status === 'unknown' ? manualErrors.delivery_unknown : `发送失败。${receipt.code === '40034105' ? manualErrors.proactive_denied : `QQ 错误码：${receipt.code ?? '未知'}`}`
      if (receipt.status === 'sent' || receipt.status === 'failed')
        preview.value = undefined
      if (receipt.status === 'sent')
        text.value = ''
    }
    else {
      preview.value = undefined
      notice.value = input.operation === 'begin' ? '此会话已暂停自动回复，接管结束或到时后自动恢复。' : '接管已结束。下一条新消息将按原策略自动回复。'
    }
    await refresh()
  }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '操作失败，请刷新状态。' }
  finally { busy.value = false }
}

function send() {
  if (preview.value) {
    void perform({ operation: 'send', preview: preview.value.id })
  }
  else if (ready.value && session.value && lease.value && text.value.trim()) {
    void perform({ operation: 'preview', target: session.value.id, lease: lease.value.id, text: text.value, mode: mode.value })
  }
}

let poll: ReturnType<typeof setInterval> | undefined
let timer: ReturnType<typeof setInterval> | undefined
function start() {
  if (poll)
    return
  void refresh().catch(failure => error.value = String(failure))
  poll = setInterval(() => {
    if (!busy.value && document.visibilityState === 'visible')
      void refresh().catch(failure => error.value = String(failure))
  }, 3000)
  timer = setInterval(() => clock.value = Date.now(), 1000)
}
function stop() {
  clearInterval(poll)
  clearInterval(timer)
  poll = undefined
  timer = undefined
}
onMounted(start)
onActivated(start)
onDeactivated(stop)
onUnmounted(stop)
</script>

<template>
  <section class="manual" aria-label="主人手动接管" :aria-busy="busy">
    <header class="page-heading">
      <div><h1>手动接管</h1><p>暂时接过一个会话，用自己的话，以机器人的身份回应。</p></div>
      <span class="manual-status" :data-online="state?.online">{{ state?.online ? '机器人在线' : '等待机器人连接' }}</span>
    </header>
    <p v-if="error" class="error" role="alert">
      {{ error }}
    </p>
    <p v-if="notice" class="notice" role="status">
      {{ notice }}
    </p>
    <div class="manual-layout">
      <section class="dsh-section manual-sessions">
        <div class="section-heading">
          <h2>选择会话</h2><button type="button" class="dsh-button" data-variant="ghost" data-size="sm" :disabled="busy" @click="refresh().catch(failure => error = String(failure))">
            刷新
          </button>
        </div>
        <p class="manual-small">
          仅显示当前绑定机器人允许聊天的会话。
        </p>
        <button v-for="row in state?.sessions ?? []" :key="row.id" class="manual-session" :aria-pressed="selected === row.id" :disabled="busy || !!preview" @click="selected = row.id">
          <span class="manual-eyebrow">{{ row.scope === 'group' ? 'QQ 群聊' : '主人私聊' }}</span>
          <strong>{{ row.title }}</strong>
          <small>{{ row.lease && row.lease.expiresAt > clock + offset ? '人工接管中' : '自动回复' }} · {{ row.id.slice(0, 8) }}</small>
        </button>
        <p v-if="state && !state.sessions.length">
          暂无可聊天会话。请先由主人完成机器人绑定与会话配置。
        </p>
      </section>
      <div v-if="session" class="manual-detail">
        <section class="dsh-section manual-control">
          <div class="section-heading">
            <div><span class="manual-eyebrow">{{ session.scope === 'group' ? '群聊' : '私聊' }} · {{ session.id.slice(0, 8) }}</span><h2>{{ session.title }}</h2></div><span class="manual-badge">{{ lease ? lease.phase === 'pausing' ? '正在暂停' : '人工接管' : '自动回复' }}</span>
          </div>
          <div v-if="!lease" class="manual-start">
            <label>接管时长<select v-model.number="seconds" class="form-input" :disabled="busy"><option :value="300">5 分钟</option><option :value="600">10 分钟</option><option :value="1800">30 分钟</option></select></label>
            <button type="button" class="dsh-button" :disabled="busy || !state?.online" @click="perform({ operation: 'begin', target: session!.id, seconds })">
              暂停自动回复并接管
            </button>
          </div>
          <div v-else class="manual-start">
            <p role="status">
              {{ lease.phase === 'pausing' ? '正在等待当前任务及在途回复结束。' : `自动回复已暂停，${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒后恢复。` }}
            </p><button type="button" class="dsh-button" data-variant="outline" :disabled="busy || !!preview" @click="perform({ operation: 'end', target: session!.id, lease: lease!.id })">
              结束接管，恢复自动回复
            </button>
          </div>
          <p class="manual-small">
            关闭页面不会立刻结束接管；到时会自动恢复。已提交给 QQ 的消息不会因结束接管而撤回。
          </p>
        </section>
        <section class="dsh-section manual-compose">
          <h2>以机器人身份发送原文</h2>
          <p class="manual-small">
            {{ permission }}。QQ 中的“允许主动发送”设置仍然生效，发送以平台回执为准。
          </p>
          <label>发送方式<select v-model="mode" class="form-input" :disabled="!ready || !!preview"><option value="proactive">主动发送</option><option value="reply" :disabled="!session.replyAvailable">回复最近消息（需要有效回复窗口）</option></select></label>
          <label class="manual-editor">消息原文<textarea v-model="text" aria-label="消息原文" class="form-input" rows="6" maxlength="1200" :disabled="!ready || !!preview" placeholder="先暂停自动回复，再输入要发送的原文。" /></label>
          <div class="actions">
            <small>{{ text.length }} / 1200 · 不调用模型，不改写文字</small><button type="button" class="dsh-button" :disabled="busy || (!preview && (!ready || !text.trim()))" @click="send">
              {{ preview ? '重试同一次请求' : '发送' }}
            </button>
          </div>
          <div v-if="preview" class="manual-small" role="status">
            <p>发送结果待确认，请先到 QQ 核对；重试会沿用同一次请求。</p>
            <button type="button" class="dsh-button" data-variant="outline" :disabled="busy" @click="preview = undefined">
              已核对 QQ，保留原文
            </button>
          </div>
        </section>
        <section class="dsh-section manual-context">
          <h2>最近收到的消息</h2><p v-if="!session.recent.length" class="manual-small">
            连接后收到的新消息会显示在这里；接管期间不会交给模型处理。
          </p><div v-for="(message, index) in session.recent.slice(-5)" :key="index" class="manual-received">
            <time>{{ new Date(message.receivedAt).toLocaleTimeString() }}</time><p>{{ message.text }}</p>
          </div>
        </section>
        <section v-if="receipts.length" class="dsh-section manual-receipts">
          <h2>发送回执</h2><div v-for="receipt in receipts.slice(0, 5)" :key="receipt.id" class="manual-receipt">
            <span>{{ new Date(receipt.createdAt).toLocaleTimeString() }} · {{ receipt.mode === 'proactive' ? '主动发送' : '被动回复' }}</span><strong>{{ receipt.status === 'sent' ? 'QQ 已确认' : receipt.status === 'failed' ? '发送失败' : receipt.status === 'pending' ? '发送中' : '结果未知，请先在 QQ 确认' }}</strong><small v-if="receipt.code">{{ receipt.code }}</small>
          </div>
        </section>
      </div>
    </div>
    <footer class="manual-small">
      主人专用 · 会话权限与发送限流始终生效 · <a href="https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/overview.html" target="_blank" rel="noopener noreferrer">QQ 平台发送规则</a>
    </footer>
  </section>
</template>

<style scoped>
.manual-eyebrow,
.manual-small,
small {
  color: var(--bot-secondary);
  font-size: var(--bot-text-sm);
}
.manual-status,
.manual-badge {
  padding: var(--bot-space-1) var(--bot-space-2);
  border-radius: var(--dsw-radius-sm, 8px);
  background: var(--bot-hover);
  font-size: var(--bot-text-xs);
  white-space: nowrap;
}
.manual-status[data-online='true'] {
  color: var(--bot-success);
}
.manual-layout {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  gap: var(--bot-space-4);
  align-items: start;
}
.manual-detail {
  display: grid;
  gap: var(--bot-space-4);
  min-width: 0;
}
.manual-session {
  display: grid;
  gap: var(--bot-space-1);
  width: 100%;
  padding: var(--bot-space-3);
  margin-top: var(--bot-space-2);
  border-radius: var(--bot-radius);
  border: 0.5px solid transparent;
  background: transparent;
  color: inherit;
  text-align: left;
  overflow-wrap: anywhere;
}
.manual-session[aria-pressed='true'] {
  background: var(--bot-selected);
}
.manual-session:hover:not(:disabled) {
  background: var(--bot-hover);
}
.manual-session strong {
  font-size: var(--bot-text-base);
  font-weight: 500;
}
.manual-start {
  display: flex;
  align-items: end;
  flex-wrap: wrap;
  gap: var(--bot-space-4);
  margin: var(--bot-space-3) 0;
}
label {
  display: grid;
  gap: var(--bot-space-2);
  min-width: 0;
  font-size: var(--bot-text-base);
}
.manual-editor {
  margin: var(--bot-space-4) 0 var(--bot-space-3);
}
textarea {
  resize: vertical;
  line-height: var(--bot-leading);
}
.manual-received,
.manual-receipt {
  padding: var(--bot-space-3) 0;
  border-top: 0.5px solid var(--bot-border);
}
.manual-received p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
time {
  color: var(--bot-secondary);
  font-size: var(--bot-text-xs);
}
.manual-receipt {
  display: grid;
  gap: var(--bot-space-1);
  font-size: var(--bot-text-sm);
}
@media (max-width: 760px) {
  .manual-layout {
    grid-template-columns: 1fr;
  }
}
</style>
