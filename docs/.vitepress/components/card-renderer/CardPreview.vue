<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'

defineProps<{ src: string, title: string }>()
const frame = useTemplateRef<HTMLIFrameElement>('frame')
const height = shallowRef(800)
let observer: ResizeObserver | undefined
let lastWidth = 0

function resize() {
  const element = frame.value?.contentDocument?.querySelector('.el-card-page')
  if (element)
    height.value = Math.ceil(element.getBoundingClientRect().height)
}

function loaded() {
  resize()
  observer?.disconnect()
  observer = new ResizeObserver((entries) => {
    const width = entries[0]?.contentRect.width
    if (width !== lastWidth) {
      lastWidth = width
      resize()
    }
  })
  if (frame.value)
    observer.observe(frame.value)
}

onBeforeUnmount(() => observer?.disconnect())
onMounted(loaded)
</script>

<template>
  <iframe ref="frame" class="card-preview" :src="src" :title="title" sandbox="allow-same-origin" :style="{ height: `${height}px` }" @load="loaded" />
</template>

<style scoped>
.card-preview {
  display: block;
  width: 100%;
  border: 0;
  border-radius: var(--ylf-radius-lg);
  background: var(--ylf-c-bg);
}
</style>
