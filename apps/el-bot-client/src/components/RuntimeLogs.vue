<script setup lang="ts">
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import YlfCard from '@yunlefun/vue/components/YlfCard.vue'

defineProps<{ text: string, disabled: boolean }>()
defineEmits<{ refresh: [] }>()
</script>

<template>
  <YlfCard class="logs" :hoverable="false">
    <div class="section-heading">
      <h2>最近记录</h2><YlfButton variant="secondary" size="sm" :disabled="disabled" @click="$emit('refresh')">
        刷新日志
      </YlfButton>
    </div>
    <pre class="log-output" tabindex="0" aria-label="运行日志内容">{{ text || '暂无日志。后台启动后，连接进度和错误会显示在这里。' }}</pre>
  </YlfCard>
</template>
