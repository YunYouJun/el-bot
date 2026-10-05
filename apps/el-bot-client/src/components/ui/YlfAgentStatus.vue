<script setup lang="ts">
import type { YlfAgentState } from './agent'

withDefaults(defineProps<{
  state: YlfAgentState
  /** Localized, truthful status text supplied by the application. */
  label: string
  /** Opt in for a single live summary, rather than every polled indicator. */
  live?: boolean
}>(), { live: false })
</script>

<template>
  <span class="ylf-agent-status" :data-state="state" :role="live ? 'status' : undefined" :aria-atomic="live || undefined">
    <span class="ylf-agent-status__mark" aria-hidden="true" />
    <span>{{ label }}</span>
  </span>
</template>

<style scoped>
.ylf-agent-status {
  --agent-color: var(--ylf-c-text-2, #475569);
  --agent-surface: var(--ylf-c-bg-soft, #f1f5f9);

  display: inline-flex;
  align-items: center;
  gap: var(--ylf-space-2, 8px);
  max-width: 100%;
  padding: 5px 10px;
  border-radius: var(--ylf-radius-pill, 999px);
  background: var(--agent-surface);
  color: var(--agent-color);
  font-family: var(--ylf-font-body, inherit);
  font-size: var(--ylf-text-xs, 12px);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.ylf-agent-status[data-state='ready'] {
  --agent-color: var(--ylf-status-success-text, #166534);
  --agent-surface: var(--ylf-status-success-soft, #dcfce7);
}
.ylf-agent-status[data-state='connecting'],
.ylf-agent-status[data-state='working'] {
  --agent-color: var(--ylf-c-brand, #2563eb);
  --agent-surface: var(--ylf-c-brand-soft, #eff6ff);
}
.ylf-agent-status[data-state='waiting'] {
  --agent-color: var(--ylf-status-warning-text, #854d0e);
  --agent-surface: var(--ylf-status-warning-soft, #fef9c3);
}
.ylf-agent-status[data-state='error'] {
  --agent-color: var(--ylf-status-danger-text, #9a3412);
  --agent-surface: var(--ylf-status-danger-soft, #ffede6);
}
.ylf-agent-status__mark {
  flex: none;
  width: 7px;
  height: 7px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
}
.ylf-agent-status[data-state='ready'] .ylf-agent-status__mark,
.ylf-agent-status[data-state='working'] .ylf-agent-status__mark {
  background: currentColor;
}
.ylf-agent-status[data-state='waiting'] .ylf-agent-status__mark {
  border-radius: 2px;
}
</style>
