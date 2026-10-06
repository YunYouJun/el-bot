<script setup lang="ts">
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import { onBeforeUnmount, shallowRef } from 'vue'

const props = defineProps<{ source: string, label: string }>()
const feedback = shallowRef('复制源码')
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await navigator.clipboard.writeText(props.source)
    feedback.value = '已复制'
  }
  catch {
    feedback.value = '请选中文字复制'
  }
  clearTimeout(timer)
  timer = setTimeout(() => { feedback.value = '复制源码' }, 2000)
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <details class="card-source">
    <summary class="source-summary">
      {{ label }}
    </summary>
    <div class="source-content">
      <YlfButton class="source-copy" type="button" variant="secondary" size="sm" :round="false" aria-live="polite" @click="copy">
        {{ feedback }}
      </YlfButton>
      <pre class="source-code"><code>{{ source }}</code></pre>
    </div>
  </details>
</template>

<style scoped>
.card-source { margin-top: var(--ylf-space-4); border: 1px solid var(--ylf-c-border); border-radius: var(--ylf-radius); background: var(--ylf-c-surface); }
.source-summary { cursor: pointer; padding: var(--ylf-space-4); font-size: var(--ylf-text-sm); font-weight: 600; }
.source-summary:focus-visible { outline: 2px solid var(--ylf-c-brand); outline-offset: 3px; border-radius: var(--ylf-radius); }
.source-content { border-top: 1px solid var(--ylf-c-border); padding: var(--ylf-space-4); }
.source-copy { display: flex; min-height: 44px; margin-left: auto; }
.source-code { margin: var(--ylf-space-3) 0 0; padding: 0; max-height: 360px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ylf-c-text-2); font: var(--ylf-text-sm)/var(--ylf-leading-body) var(--ylf-font-mono); background: none; }
.source-code code { padding: 0; font: inherit; background: none; }
</style>
