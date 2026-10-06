<script setup lang="ts">
import YlfSegmentedControl from '@yunlefun/vue/components/YlfSegmentedControl.vue'
import { withBase } from 'vitepress'
import { computed, shallowRef } from 'vue'
import { cardExamples } from '../../../../apps/qq-codex/src/card-renderer/examples'
import CardPreview from './CardPreview.vue'
import CardSource from './CardSource.vue'
import '@yunlefun/ui/css'

const selected = shallowRef(cardExamples[0].id)
const theme = shallowRef<'light' | 'dark'>('dark')
const types = cardExamples.map(example => ({ value: example.id, label: example.title }))
const themes = [{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }] as const
const active = computed(() => cardExamples.find(example => example.id === selected.value) ?? cardExamples[0])
const preview = computed(() => withBase(`/card-renderer/${active.value.id}-${theme.value}.html`))
const source = computed(() => active.value.card.details.help ? JSON.stringify(active.value.card.details.help, null, 2) : active.value.card.details.body)
</script>

<template>
  <section class="renderer-demo" aria-label="图片卡片示例">
    <div class="demo-toolbar">
      <YlfSegmentedControl v-model="selected" class="demo-types" :options="types" label="示例类型" />
      <YlfSegmentedControl v-model="theme" :options="themes" label="卡片主题" />
    </div>
    <p class="demo-caption" aria-live="polite">
      {{ active.description }}
    </p>
    <CardPreview :src="preview" :title="`${active.title} · ${theme === 'dark' ? '深色' : '浅色'}`" />
    <CardSource :source="source" :label="active.card.details.help ? '查看帮助数据' : '查看 Markdown 源码'" />
  </section>
</template>

<style scoped>
.renderer-demo { margin: var(--ylf-space-8) 0; font-family: var(--ylf-font-body); }
.demo-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ylf-space-3); }
.demo-types { flex-wrap: wrap; }
.demo-caption { font-size: var(--ylf-text-sm); color: var(--ylf-c-text-2); line-height: var(--ylf-leading-body); margin: var(--ylf-space-4) 0 !important; }
@media (max-width: 540px) {
  .demo-types :deep(.ylf-segmented__item) { padding-inline: var(--ylf-space-2); }
}
</style>
