<script setup lang="ts">
import type { YlfAgentState } from './agent'
import { useId } from 'vue'
import YlfAgentStatus from './YlfAgentStatus.vue'

defineProps<{
  name: string
  description?: string
  state: YlfAgentState
  statusLabel: string
}>()
const titleId = useId()
</script>

<template>
  <article class="ylf-agent-card" :aria-labelledby="titleId">
    <div class="ylf-agent-card__header">
      <div class="ylf-agent-card__avatar">
        <slot name="avatar">
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="M16 4v4M12 4h8M6 18H3m26 0h-3" />
            <rect x="6" y="8" width="20" height="19" rx="7" />
            <path d="M12 15v3m8-3v3m-7 5h6" />
          </svg>
        </slot>
      </div>
      <div class="ylf-agent-card__identity">
        <h2 :id="titleId" class="ylf-agent-card__name">
          {{ name }}
        </h2>
        <p v-if="description" class="ylf-agent-card__description">
          {{ description }}
        </p>
      </div>
      <YlfAgentStatus :state="state" :label="statusLabel" />
    </div>
    <div v-if="$slots.default" class="ylf-agent-card__body">
      <slot />
    </div>
    <div v-if="$slots.actions" class="ylf-agent-card__actions">
      <slot name="actions" />
    </div>
  </article>
</template>

<style scoped>
.ylf-agent-card {
  min-width: 0;
  padding: var(--ylf-space-6, 24px);
  border: 1px solid var(--ylf-c-border, #e2e8f0);
  border-radius: var(--ylf-radius-lg, 20px);
  background: var(--ylf-c-surface, #fff);
  color: var(--ylf-c-text, #0f172a);
  box-shadow: var(--ylf-shadow-control, none);
  font-family: var(--ylf-font-body, inherit);
}
.ylf-agent-card__header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ylf-space-4, 16px);
}
.ylf-agent-card__avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 52px;
  height: 52px;
  border-radius: var(--ylf-radius, 14px);
  background: var(--ylf-c-brand-soft, #eff6ff);
  color: var(--ylf-c-brand, #2563eb);
}
.ylf-agent-card__avatar svg {
  width: 32px;
  height: 32px;
}
.ylf-agent-card__identity {
  flex: 1 1 160px;
  min-width: 0;
}
.ylf-agent-card__name {
  margin: 0;
  font-family: var(--ylf-font-heading, inherit);
  font-size: var(--ylf-text-lg, 20px);
  line-height: var(--ylf-leading-heading, 1.25);
  overflow-wrap: anywhere;
}
.ylf-agent-card__description {
  margin: var(--ylf-space-2, 8px) 0 0;
  color: var(--ylf-c-text-2, #475569);
  font-size: var(--ylf-text-sm, 14px);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.ylf-agent-card__body {
  margin-top: var(--ylf-space-6, 24px);
  min-width: 0;
}
.ylf-agent-card__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ylf-space-3, 12px);
  margin-top: var(--ylf-space-6, 24px);
  padding-top: var(--ylf-space-4, 16px);
  border-top: 1px solid var(--ylf-c-border, #e2e8f0);
}
</style>
