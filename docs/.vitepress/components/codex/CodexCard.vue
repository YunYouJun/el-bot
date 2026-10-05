<script setup lang="ts">
import type { ExampleMessage } from './types'

defineProps<{ message: ExampleMessage }>()
</script>

<template>
  <div class="codex-card">
    <p class="card-title">
      {{ message.title }}
    </p>
    <dl v-if="message.fields" class="card-fields">
      <div v-for="field in message.fields" :key="field.label" class="card-field">
        <dt>{{ field.label }}</dt>
        <dd>{{ field.value }}</dd>
      </div>
    </dl>
    <p v-if="message.section" class="card-section">
      {{ message.section }}
    </p>
    <p class="card-body">
      {{ message.text }}
    </p>
    <p v-if="message.footnote" class="card-footnote">
      {{ message.footnote }}
    </p>
    <div v-if="message.actions" class="card-actions" aria-label="QQ 操作按钮示意">
      <span v-for="action in message.actions" :key="action.label" class="card-action" :class="action.tone ?? 'secondary'">{{ action.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.codex-card {
  --card-blue: #087ac4;
  --card-red: #b83737;
  padding: 16px;
  border-radius: 3px 12px 12px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.card-title {
  margin: 0 0 14px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
}
.card-fields {
  display: grid;
  gap: 4px;
  margin: 0 0 14px;
}
.card-field {
  display: flex;
  gap: 12px;
}
.card-field dt {
  flex: 0 0 auto;
  font-weight: 600;
}
.card-field dd {
  margin: 0;
  color: var(--vp-c-text-2);
}
.card-section {
  margin: 0 0 6px;
  font-weight: 600;
}
.card-body {
  margin: 0;
  padding-left: 12px;
  border-left: 3px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  white-space: pre-wrap;
}
.card-footnote {
  margin: 14px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--vp-c-divider);
  font-size: 12px;
  color: var(--vp-c-text-2);
  white-space: pre-wrap;
}
.card-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 12px;
}
.card-action {
  padding: 5px 4px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
}
.primary {
  border-color: var(--card-blue);
  color: var(--card-blue);
}
.secondary {
  color: var(--vp-c-text-2);
}
.danger {
  background: var(--vp-c-bg);
  border-color: var(--card-red);
  color: var(--card-red);
}
:global(.dark .codex-card) {
  --card-blue: #6abdf5;
  --card-red: #ff9a9a;
}
</style>
