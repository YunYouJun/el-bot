<script setup lang="ts">
import type { Operation, RuntimeStatus } from '../types'
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import YlfDialog from '@yunlefun/vue/components/YlfDialog.vue'
import { computed, shallowRef, watch } from 'vue'
import { connectionIndicator, runtimeIndicator, taskIndicator } from '../runtime-presentation'
import ProgramLogo from './ProgramLogo.vue'
import YlfAgentCard from './ui/YlfAgentCard.vue'
import YlfAgentStatus from './ui/YlfAgentStatus.vue'
import YlfAgentTask from './ui/YlfAgentTask.vue'

const props = defineProps<{ status?: RuntimeStatus, pending: boolean }>()
const emit = defineEmits<{ action: [operation: Exclude<Operation, 'status' | 'logs'>, interrupt: boolean] }>()
const confirming = shallowRef<'stop' | 'restart'>()
const summary = computed(() => runtimeIndicator(props.status))
const qq = computed(() => connectionIndicator(props.status, 'qq'))
const codex = computed(() => connectionIndicator(props.status, 'codex'))
const agent = computed(() => props.status?.agent ?? 'codex')
const agentName = computed(() => ({ codex: 'Codex', codebuddy: 'CodeBuddy', dsh: 'DSH' })[agent.value])
const task = computed(() => taskIndicator(props.status))
const taskDescription = computed(() => {
  if (!props.status || props.status.phase === 'unmanaged')
    return '连接后显示任务状态。'
  if (props.status.task?.status === 'failed')
    return '任务未能完成。可以在运行日志中查看原因。'
  if (props.status.task?.status === 'interrupted')
    return '任务已中断，已产生的修改不会撤销。'
  if (props.status.task?.status === 'completed')
    return '任务已完成，可在 QQ 中查看回复。'
  if (props.status.busy)
    return '机器人正在处理任务或管理操作。停止和重启前需要确认中断。'
  return '在 QQ 中发送消息，机器人会在这里显示任务状态。'
})
const running = computed(() => props.status?.phase === 'running')
const canStop = computed(() => running.value || props.status?.phase === 'starting')
const dialogOpen = computed({
  get: () => Boolean(confirming.value),
  set: (value: boolean) => {
    if (!value)
      confirming.value = undefined
  },
})
watch(() => props.status?.phase, (phase) => {
  if (phase !== 'running' && phase !== 'starting')
    confirming.value = undefined
})
function requestAction(operation: 'start' | 'stop' | 'restart') {
  if (props.pending || !props.status)
    return
  if (operation === 'start') {
    if (props.status.phase === 'stopped')
      emit('action', operation, false)
    return
  }
  if (operation === 'stop' ? !canStop.value : !running.value)
    return
  if (props.status?.busy)
    confirming.value = operation
  else emit('action', operation, false)
}
function interrupt() {
  if (!props.pending && confirming.value && props.status && (confirming.value === 'stop' ? canStop.value : running.value))
    emit('action', confirming.value, true)
  confirming.value = undefined
}
defineExpose({ requestAction })
</script>

<template>
  <YlfAgentCard class="runtime-panel" name="el-bot" :state="summary.state" :status-label="summary.label" :description="status?.project ? `当前项目：${status.project}` : '通过 QQ 私聊使用本机 AI 助手'">
    <dl class="connection-list">
      <div>
        <dt class="connection-label">
          <ProgramLogo program="qq" />
          <span>QQ 连接</span>
        </dt>
        <dd><YlfAgentStatus :state="qq.state" :label="qq.label" /></dd>
      </div>
      <div>
        <dt class="connection-label">
          <ProgramLogo :program="agent" />
          <span>{{ agentName }}</span>
        </dt>
        <dd><YlfAgentStatus :state="codex.state" :label="codex.label" /></dd>
      </div>
    </dl>
    <YlfAgentTask title="当前任务" :state="task.state" :status-label="task.label" :task-id="status?.phase === 'unmanaged' ? undefined : status?.task?.id" :description="taskDescription" />
    <p v-if="status?.message" class="notice">
      {{ status.message }}
    </p>
    <template #actions>
      <YlfButton :disabled="pending || !status || status.phase !== 'stopped'" @click="requestAction('start')">
        启动机器人
      </YlfButton>
      <YlfButton variant="secondary" :disabled="pending || !canStop" @click="requestAction('stop')">
        停止
      </YlfButton>
      <YlfButton variant="secondary" :disabled="pending || !running" @click="requestAction('restart')">
        重启
      </YlfButton>
      <span v-if="pending" role="status">正在处理…</span>
    </template>
  </YlfAgentCard>
  <YlfDialog v-model:open="dialogOpen" title="仍有任务正在执行" description="中断会保留已产生的修改和已收到的结果。也可以等待任务完成后再操作。">
    <div class="actions">
      <YlfButton variant="secondary" @click="confirming = undefined">
        继续运行
      </YlfButton>
      <YlfButton variant="danger" :disabled="pending" @click="interrupt">
        中断并{{ confirming === 'restart' ? '重启' : '停止' }}
      </YlfButton>
    </div>
  </YlfDialog>
  <p class="footnote">
    关窗后驻留菜单栏／托盘。退出客户端后，机器人仍继续运行。
  </p>
</template>

<style scoped>
.runtime-panel {
  padding: var(--ylf-space-4);
}
.connection-label {
  display: flex;
  align-items: center;
  gap: var(--ylf-space-2);
}
.runtime-panel :deep(.ylf-agent-card__header) {
  gap: var(--ylf-space-3);
}
.runtime-panel :deep(.ylf-agent-card__avatar) {
  width: 40px;
  height: 40px;
}
.runtime-panel :deep(.ylf-agent-card__avatar svg) {
  width: 26px;
  height: 26px;
}
.runtime-panel :deep(.ylf-agent-card__description) {
  margin-top: var(--ylf-space-1);
}
.runtime-panel :deep(.ylf-agent-card__body) {
  margin-top: var(--ylf-space-4);
}
.runtime-panel :deep(.ylf-agent-card__actions) {
  gap: var(--ylf-space-2);
  margin-top: var(--ylf-space-4);
  padding-top: var(--ylf-space-3);
}
.runtime-panel :deep(.ylf-agent-task) {
  padding: var(--ylf-space-3);
}
.runtime-panel :deep(.ylf-agent-task__description) {
  margin-top: var(--ylf-space-2);
}
@media (max-width: 720px) {
  .runtime-panel :deep(.ylf-button) {
    min-height: 44px;
  }
}
</style>
