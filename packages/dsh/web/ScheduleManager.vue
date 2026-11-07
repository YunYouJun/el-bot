<script setup lang="ts">
import type { ScheduleKind, ScheduleRequest, ScheduleStateView, ScheduleTaskView } from '../src/qq-security/schedule-types'
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, shallowRef } from 'vue'

const state = shallowRef<ScheduleStateView>()
const busy = ref(false)
const error = ref('')
const notice = ref('')
const preview = ref<{ title: string, text: string, kind: ScheduleKind }>()
const editing = ref('')
const form = reactive({
  target: '',
  kind: 'text' as ScheduleKind,
  time: '22:00',
  days: [1, 2, 3, 4, 5, 6, 7] as number[],
  enabled: true,
  text: '',
  windowHours: 24,
  maxMessages: 200,
})

const days = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
]
const kinds = [
  { value: 'text', label: '固定文本' },
  { value: 'summary', label: 'AI 群聊总结' },
  { value: 'digest', label: '规则统计' },
] as const
const selected = computed(() => state.value?.targets.find(row => row.id === form.target))
const summaryModel = computed(() => selected.value?.model)
const canSubmit = computed(() => !!form.target && !!form.time && form.days.length > 0
  && (form.kind !== 'text' || form.text.trim().length > 0) && !busy.value)

function kindLabel(kind: ScheduleKind) {
  return kinds.find(row => row.value === kind)?.label ?? kind
}

function statusLabel(task: ScheduleTaskView) {
  if (!task.lastStatus)
    return '尚未运行'
  const text = task.lastStatus === 'sent' ? '已发送' : task.lastStatus === 'offline' ? '离线跳过' : task.lastStatus === 'unknown' ? '结果未知' : '发送失败'
  return task.lastCode ? `${text} · ${task.lastCode}` : text
}

function format(ms?: number) {
  if (!ms)
    return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: state.value?.timezone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms))
}

function daysLabel(values: number[]) {
  return values.length === 7 ? '每天' : values.map(day => days.find(row => row.value === day)?.label ?? day).join('、')
}

async function request(input: ScheduleRequest) {
  const response = await fetch('/el-bot/schedule/api', {
    method: input.operation === 'list' ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: input.operation === 'list' ? {} : { 'content-type': 'application/json', 'x-el-bot-schedule': '1' },
    body: input.operation === 'list' ? undefined : JSON.stringify(input),
  })
  const data = await response.json()
  if (!response.ok || !data.ok)
    throw new Error(data.error ?? '无法连接定时任务服务，请重新登录 DSH。')
  return data.result
}

async function refresh() {
  state.value = await request({ operation: 'list' }) as ScheduleStateView
  if (!form.target)
    form.target = state.value.targets[0]?.id ?? ''
}

function reset() {
  editing.value = ''
  form.kind = 'text'
  form.time = '22:00'
  form.days = [1, 2, 3, 4, 5, 6, 7]
  form.enabled = true
  form.text = ''
  form.windowHours = 24
  form.maxMessages = 200
  form.target = state.value?.targets[0]?.id ?? form.target
}

function edit(task: ScheduleTaskView) {
  editing.value = task.id
  form.target = task.target
  form.kind = task.kind
  form.time = task.time
  form.days = [...task.days]
  form.enabled = task.enabled
  form.text = task.text ?? ''
  form.windowHours = task.windowHours
  form.maxMessages = task.maxMessages
}

async function perform(input: ScheduleRequest) {
  if (busy.value)
    return
  busy.value = true
  error.value = ''
  notice.value = ''
  if (input.operation === 'preview')
    preview.value = undefined
  try {
    const result = await request(input)
    if (input.operation === 'preview') {
      preview.value = result as { title: string, text: string, kind: ScheduleKind }
      notice.value = '只生成了内容，没有向 QQ 发送。'
    }
    else if (input.operation === 'run') {
      const run = (result as { run: { status: string, code?: string } }).run
      notice.value = run.status === 'sent' ? '已立即发送，QQ 已确认。' : `本次未发送：${run.code ?? run.status}`
      state.value = (result as { view: ScheduleStateView }).view
    }
    else {
      state.value = result as ScheduleStateView
      if (input.operation === 'create' || input.operation === 'update')
        notice.value = input.operation === 'create' ? '定时任务已创建。' : '定时任务已更新。'
      if (input.operation === 'delete')
        notice.value = '定时任务已删除。'
      if (input.operation === 'create' || input.operation === 'update')
        reset()
    }
  }
  catch (failure) {
    error.value = failure instanceof Error ? failure.message : '操作失败，请刷新状态。'
  }
  finally {
    busy.value = false
  }
}

function submit() {
  if (!canSubmit.value)
    return
  const payload = {
    target: form.target,
    kind: form.kind,
    time: form.time,
    days: form.days,
    enabled: form.enabled,
    windowHours: form.windowHours,
    maxMessages: form.maxMessages,
    ...(form.kind === 'text' ? { text: form.text } : {}),
  }
  void perform(editing.value
    ? { operation: 'update', id: editing.value, ...payload }
    : { operation: 'create', ...payload })
}

function toggle(task: ScheduleTaskView) {
  void perform({ operation: 'update', id: task.id, enabled: !task.enabled })
}

let poll: ReturnType<typeof setInterval> | undefined
function start() {
  if (poll)
    return
  void refresh().catch(failure => error.value = String(failure))
  poll = setInterval(() => {
    if (!busy.value && document.visibilityState === 'visible')
      void refresh().catch(failure => error.value = String(failure))
  }, 5000)
}
function stop() {
  clearInterval(poll)
  poll = undefined
}
onMounted(start)
onActivated(start)
onDeactivated(stop)
onUnmounted(stop)
</script>

<template>
  <section class="schedule" aria-label="定时群发" :aria-busy="busy">
    <header class="page-heading">
      <div><h1>定时群发</h1><p>由主人手动配置，到点以机器人身份向群里发送一条消息。</p></div>
      <span class="schedule-status" :data-online="state?.online">{{ state?.online ? '机器人在线' : '等待机器人连接' }}</span>
    </header>
    <p v-if="error" class="error" role="alert">
      {{ error }}
    </p>
    <p v-if="notice" class="notice" role="status">
      {{ notice }}
    </p>
    <section v-if="preview" class="dsh-section schedule-preview-box" aria-label="定时任务预览">
      <div class="section-heading">
        <h2>{{ preview.title }} · 预览</h2>
        <button type="button" class="dsh-button" data-variant="ghost" data-size="sm" @click="preview = undefined">
          关闭
        </button>
      </div>
      <p class="schedule-hint">
        以下是本次会发送的原文，尚未提交给 QQ。AI 总结每次生成可能不同。
      </p>
      <textarea class="form-input" rows="10" readonly :value="preview.text" aria-label="预览内容" />
    </section>
    <p class="schedule-warning">
      主动发送仍受 QQ 群“允许主动发送”设置和平台权限限制。失败不会自动重试，也不会改发到其他群。AI 总结会把窗口内的群文本发送给该群当前模型提供方。时区：{{ state?.timezone ?? 'Asia/Shanghai' }}。
    </p>

    <div class="schedule-layout">
      <section class="dsh-section schedule-form">
        <div class="section-heading">
          <h2>{{ editing ? '编辑任务' : '新建任务' }}</h2>
          <button v-if="editing" type="button" class="dsh-button" data-variant="ghost" data-size="sm" :disabled="busy" @click="reset">
            取消编辑
          </button>
        </div>
        <label>目标群<select v-model="form.target" class="form-input" :disabled="busy">
          <option v-for="target in state?.targets ?? []" :key="target.id" :value="target.id">{{ target.title }}</option>
        </select></label>
        <div class="schedule-row">
          <label>类型<select v-model="form.kind" class="form-input" :disabled="busy">
            <option v-for="kind in kinds" :key="kind.value" :value="kind.value">{{ kind.label }}</option>
          </select></label>
          <label>时间<input v-model="form.time" type="time" class="form-input" :disabled="busy"></label>
        </div>
        <fieldset class="schedule-days">
          <legend>星期</legend>
          <label v-for="day in days" :key="day.value">
            <input v-model="form.days" type="checkbox" :value="day.value" :disabled="busy"> 周{{ day.label }}
          </label>
        </fieldset>
        <label v-if="form.kind === 'text'">发送原文<textarea v-model="form.text" class="form-input" rows="5" maxlength="1200" :disabled="busy" placeholder="最多 1200 字符，原样发送。" /></label>
        <div v-else class="schedule-row">
          <label>统计最近<input v-model.number="form.windowHours" type="number" min="1" max="168" class="form-input" :disabled="busy"> 小时</label>
          <label>最多<input v-model.number="form.maxMessages" type="number" min="20" max="500" class="form-input" :disabled="busy"> 条</label>
        </div>
        <p v-if="form.kind === 'summary'" class="schedule-hint">
          使用该群当前选择的模型：{{ summaryModel ? `${summaryModel.provider} / ${summaryModel.model}` : '尚未选择，保存后也无法生成总结' }}。摘要生成失败时不会发送。
        </p>
        <p v-else-if="form.kind === 'digest'" class="schedule-hint">
          不调用模型，只统计窗口内的消息数、活跃成员和最近发言。
        </p>
        <label class="schedule-enabled"><input v-model="form.enabled" type="checkbox" :disabled="busy"> 创建后启用</label>
        <div class="actions">
          <small>{{ selected ? selected.title : '请选择目标群' }}</small>
          <button type="button" class="dsh-button" :disabled="!canSubmit" @click="submit">
            {{ editing ? '保存修改' : '创建任务' }}
          </button>
        </div>
      </section>

      <section class="dsh-section schedule-list">
        <div class="section-heading">
          <h2>任务</h2>
          <button type="button" class="dsh-button" data-variant="ghost" data-size="sm" :disabled="busy" @click="refresh().catch(failure => error = String(failure))">
            刷新
          </button>
        </div>
        <p v-if="state && !state.tasks.length" class="schedule-hint">
          还没有定时任务。先选择一个群，再创建固定文本或群聊总结。
        </p>
        <article v-for="task in state?.tasks ?? []" :key="task.id" class="schedule-task" :data-enabled="task.enabled">
          <header>
            <div>
              <span class="schedule-eyebrow">{{ kindLabel(task.kind) }}</span>
              <strong>{{ task.title }}</strong>
            </div>
            <span class="schedule-badge">{{ task.enabled ? '启用' : '停用' }}</span>
          </header>
          <p>{{ daysLabel(task.days) }} {{ task.time }} · 下次 {{ format(task.nextRunAt) }}</p>
          <p class="schedule-hint">
            上次 {{ format(task.lastRunAt) }} · {{ statusLabel(task) }}
          </p>
          <p v-if="task.kind !== 'text'" class="schedule-hint">
            最近 {{ task.windowHours }} 小时 · 最多 {{ task.maxMessages }} 条
          </p>
          <p v-else class="schedule-preview">
            {{ task.text }}
          </p>
          <div class="actions">
            <button type="button" class="dsh-button" data-variant="ghost" data-size="sm" :disabled="busy" @click="toggle(task)">
              {{ task.enabled ? '停用' : '启用' }}
            </button>
            <button type="button" class="dsh-button" data-variant="ghost" data-size="sm" :disabled="busy" @click="edit(task)">
              编辑
            </button>
            <button type="button" class="dsh-button" data-variant="ghost" data-size="sm" :disabled="busy || !state?.online" @click="perform({ operation: 'preview', id: task.id })">
              预览
            </button>
            <button type="button" class="dsh-button" data-variant="outline" data-size="sm" :disabled="busy || !state?.online" @click="perform({ operation: 'run', id: task.id })">
              立即执行
            </button>
            <button type="button" class="dsh-button" data-variant="ghost" data-size="sm" :disabled="busy" @click="perform({ operation: 'delete', id: task.id })">
              删除
            </button>
          </div>
        </article>
      </section>
    </div>
    <footer class="schedule-hint">
      主人专用 · 每个群最多 4 个任务 · 定时消息与手动接管共用发送配额 · 失败记录只保留 24 小时
    </footer>
  </section>
</template>

<style scoped>
.schedule {
  display: flex;
  flex-direction: column;
  gap: var(--bot-space-4);
}
.page-heading {
  align-items: flex-start;
}
.schedule-status,
.schedule-badge {
  padding: var(--bot-space-1) var(--bot-space-2);
  border-radius: var(--bot-radius-full);
  background: var(--bot-surface-raised);
  color: var(--bot-secondary);
  font-size: var(--bot-text-sm);
}
.schedule-status[data-online='true'] {
  color: var(--bot-success);
}
.schedule-warning,
.schedule-hint,
.schedule-eyebrow,
.schedule small {
  color: var(--bot-secondary);
  font-size: var(--bot-text-sm);
}
.schedule-warning {
  padding: var(--bot-space-3);
  border: 1px solid var(--bot-border);
  border-radius: var(--bot-radius-md);
  background: var(--bot-surface-raised);
}
.schedule-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
  gap: var(--bot-space-4);
  align-items: start;
}
.schedule-form,
.schedule-list {
  display: flex;
  flex-direction: column;
  gap: var(--bot-space-3);
}
.schedule-preview-box {
  display: flex;
  flex-direction: column;
  gap: var(--bot-space-2);
}
.schedule-preview-box textarea {
  width: 100%;
  resize: vertical;
  white-space: pre-wrap;
}
.schedule-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--bot-space-3);
}
.schedule-days {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bot-space-2);
  margin: 0;
  padding: 0;
  border: 0;
}
.schedule-days legend {
  width: 100%;
  margin-bottom: var(--bot-space-1);
  color: var(--bot-secondary);
  font-size: var(--bot-text-sm);
}
.schedule-days label,
.schedule-enabled {
  display: flex;
  align-items: center;
  gap: var(--bot-space-1);
  font-size: var(--bot-text-sm);
}
.schedule-task {
  display: flex;
  flex-direction: column;
  gap: var(--bot-space-2);
  padding: var(--bot-space-3);
  border: 1px solid var(--bot-border);
  border-radius: var(--bot-radius-md);
  background: var(--bot-surface);
}
.schedule-task[data-enabled='false'] {
  opacity: 0.6;
}
.schedule-task header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bot-space-2);
}
.schedule-task header div {
  display: flex;
  flex-direction: column;
  gap: var(--bot-space-1);
}
.schedule-task p {
  margin: 0;
}
.schedule-preview {
  display: -webkit-box;
  overflow: hidden;
  color: var(--bot-secondary);
  font-size: var(--bot-text-sm);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--bot-space-2);
}
.actions small {
  margin-right: auto;
}
@media (max-width: 860px) {
  .schedule-layout {
    grid-template-columns: 1fr;
  }
  .schedule-row {
    grid-template-columns: 1fr;
  }
}
</style>
