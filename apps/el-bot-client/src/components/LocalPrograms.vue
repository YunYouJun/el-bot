<script setup lang="ts">
import type { LocalProgram } from '../types'
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import YlfCard from '@yunlefun/vue/components/YlfCard.vue'
import ProgramLogo from './ProgramLogo.vue'

defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ open: [program: LocalProgram] }>()
</script>

<template>
  <YlfCard class="local-programs" :hoverable="false" padding="var(--ylf-space-4)" aria-label="打开本机程序">
    <div class="local-programs-header">
      <h2>本机程序</h2>
      <div class="actions">
        <YlfButton variant="secondary" size="sm" :disabled="disabled" @click="emit('open', 'codex')">
          <template #icon>
            <ProgramLogo program="codex" />
          </template>
          打开 Codex
        </YlfButton>
        <YlfButton variant="secondary" size="sm" :disabled="disabled" @click="emit('open', 'qq')">
          <template #icon>
            <ProgramLogo program="qq" />
          </template>
          打开 QQ
        </YlfButton>
        <YlfButton variant="secondary" size="sm" :disabled="disabled" @click="emit('open', 'codebuddy')">
          <template #icon>
            <ProgramLogo program="codebuddy" />
          </template>
          打开 CodeBuddy
        </YlfButton>
        <YlfButton variant="secondary" size="sm" title="DeepSeek Harness 的 Tauri 桌面客户端" :disabled="disabled" @click="emit('open', 'dsh')">
          <template #icon>
            <ProgramLogo program="dsh" />
          </template>
          打开 DSH Tauri
        </YlfButton>
      </div>
    </div>
    <p>在这台电脑打开已安装的应用。可在连接设置中指定应用路径。</p>
  </YlfCard>
</template>

<style scoped>
.local-programs {
  margin-top: var(--ylf-space-4);
}
.local-programs-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ylf-space-3);
}
.local-programs h2 {
  flex: none;
  font-size: var(--ylf-text-base);
  margin: 0;
}
.local-programs .actions {
  gap: var(--ylf-space-2);
}
.local-programs .ylf-button {
  padding-inline: var(--ylf-space-3);
}
.local-programs p {
  font-size: var(--ylf-text-sm);
  margin: var(--ylf-space-2) 0 0;
}
@media (max-width: 720px) {
  .local-programs .ylf-button {
    min-height: 44px;
  }
}
</style>
