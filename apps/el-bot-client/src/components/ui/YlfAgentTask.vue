<script setup lang="ts">
import type { YlfAgentState } from './agent'
import { useId } from 'vue'
import YlfAgentStatus from './YlfAgentStatus.vue'

defineProps<{
  title: string
  state: YlfAgentState
  statusLabel: string
  taskId?: string
  description?: string
}>()
const titleId = useId()
</script>

<template>
  <section class="ylf-agent-task" :aria-labelledby="titleId">
    <div class="ylf-agent-task__header">
      <h3 :id="titleId" class="ylf-agent-task__title">
        {{ title }}
      </h3>
      <YlfAgentStatus :state="state" :label="statusLabel" />
    </div>
    <code v-if="taskId" class="ylf-agent-task__id">{{ taskId }}</code>
    <p v-if="description" class="ylf-agent-task__description">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="ylf-agent-task__body">
      <slot />
    </div>
    <div v-if="$slots.actions" class="ylf-agent-task__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.ylf-agent-task {
  min-width: 0;
  padding: var(--ylf-space-4, 16px);
  border: 1px solid var(--ylf-c-border, #e2e8f0);
  border-radius: var(--ylf-radius, 14px);
  color: var(--ylf-c-text, #0f172a);
  background: var(--ylf-c-surface-raised, #f6f9ff);
  font-family: var(--ylf-font-body, inherit);
}
.ylf-agent-task__header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ylf-space-3, 12px);
  justify-content: space-between;
}
.ylf-agent-task__title {
  margin: 0;
  font-size: var(--ylf-text-sm, 14px);
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.ylf-agent-task__id {
  display: block;
  margin-top: var(--ylf-space-3, 12px);
  font-family: var(--ylf-font-mono, monospace);
  font-size: var(--ylf-text-xs, 12px);
  color: var(--ylf-c-text-2, #475569);
  overflow-wrap: anywhere;
}
.ylf-agent-task__description {
  margin: var(--ylf-space-3, 12px) 0 0;
  color: var(--ylf-c-text-2, #475569);
  font-size: var(--ylf-text-sm, 14px);
  line-height: var(--ylf-leading-body, 1.75);
  overflow-wrap: anywhere;
}
.ylf-agent-task__body,
.ylf-agent-task__actions {
  margin-top: var(--ylf-space-4, 16px);
}
.ylf-agent-task__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ylf-space-3, 12px);
}
</style>
