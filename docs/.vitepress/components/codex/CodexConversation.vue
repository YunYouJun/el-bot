<script setup lang="ts">
import type { ExampleMessage } from './types'
import CodexCard from './CodexCard.vue'

defineProps<{ messages: ExampleMessage[] }>()
</script>

<template>
  <div class="conversation" aria-label="QQ 示例对话">
    <div class="conversation-header">
      <span class="bot-avatar" aria-hidden="true">小云</span>
      <div>
        <p class="bot-name">
          我的 QQ 机器人
        </p>
        <p class="conversation-label">
          示例对话 · 本地 Codex
        </p>
      </div>
    </div>
    <ol class="messages">
      <li v-for="(message, index) in messages" :key="index" class="message" :class="message.role">
        <span class="sender">{{ message.role === 'user' ? '你' : '机器人' }}</span>
        <CodexCard v-if="message.title" class="message-card" :message="message" />
        <p v-else class="bubble">
          {{ message.text }}
        </p>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.conversation {
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 18px;
  background: var(--vp-c-bg-soft);
}
.conversation-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
}
.bot-avatar {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 14px;
  font-weight: 600;
}
.bot-name,
.conversation-label {
  margin: 0;
  line-height: 1.6;
}
.bot-name {
  font-weight: 600;
}
.conversation-label {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.messages {
  display: grid;
  gap: 16px;
  min-height: 470px;
  margin: 0;
  padding: 24px;
  list-style: none;
  align-content: start;
}
.message {
  display: grid;
  justify-items: start;
  gap: 4px;
  margin: 0;
}
.user {
  justify-items: end;
}
.sender {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.bubble {
  max-width: 94%;
  margin: 0;
  padding: 11px 14px;
  border-radius: 3px 12px 12px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.user .bubble {
  border-radius: 12px 3px 12px 12px;
  background: var(--vp-c-brand-soft);
}
.message-card {
  width: 100%;
  max-width: 94%;
}
@media (max-width: 640px) {
  .conversation-header {
    padding: 16px;
  }
  .messages {
    padding: 16px;
    min-height: 490px;
  }
}
</style>
