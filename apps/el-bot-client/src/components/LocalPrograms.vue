<script setup lang="ts">
import type { LocalProgram } from '../types'
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import YlfCard from '@yunlefun/vue/components/YlfCard.vue'

defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ open: [program: LocalProgram] }>()
</script>

<template>
  <YlfCard class="local-programs" :hoverable="false" aria-label="打开本机程序">
    <h2>本机程序</h2>
    <div class="actions">
      <YlfButton variant="secondary" :disabled="disabled" @click="emit('open', 'codex')">
        打开 Codex
      </YlfButton>
      <YlfButton variant="secondary" :disabled="disabled" @click="emit('open', 'qq')">
        打开 QQ
      </YlfButton>
    </div>
    <p>在这台电脑打开已安装的应用。可在连接设置中指定应用路径。</p>
  </YlfCard>
</template>

<style scoped>
.local-programs {
  margin-top: var(--ylf-space-6);
}
.local-programs h2 {
  font-size: var(--ylf-text-base);
  margin: 0 0 var(--ylf-space-4);
}
.local-programs p {
  font-size: var(--ylf-text-sm);
  margin-bottom: 0;
}
</style>
