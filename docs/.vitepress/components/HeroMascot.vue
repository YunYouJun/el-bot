<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData } from 'vitepress'
import type { MascotController } from './mascot/types'
import { createMascot } from './mascot/controller'
import { xiaoyunCloud } from './mascot/xiaoyun'

const { isDark } = useData()
const root = ref<HTMLButtonElement>()
let mascot: MascotController | undefined

const theme = computed(() => isDark.value
  ? { body: '#86B6DC', eye: '#0B1220', blush: '#FFB3C0' }
  : { body: '#4B86C8', eye: '#FFFFFF', blush: '#FFB3C0' })

onMounted(() => {
  if (!root.value)
    return
  mascot = createMascot(root.value, {
    rig: xiaoyunCloud,
    expression: 'idle',
    theme: theme.value,
    clickToBlink: true,
  })
})

watch(isDark, () => mascot?.setTheme(theme.value))

onBeforeUnmount(() => {
  mascot?.destroy()
  mascot = undefined
})
</script>

<template>
  <div class="hero-mascot">
    <div class="hero-mascot__stage">
      <span class="hero-mascot__halo" aria-hidden="true" />
      <span class="hero-mascot__orbit hero-mascot__orbit--outer" aria-hidden="true" />
      <span class="hero-mascot__orbit hero-mascot__orbit--inner" aria-hidden="true" />
      <span class="hero-mascot__spark" aria-hidden="true" />
      <button
        ref="root"
        class="hero-mascot__character"
        type="button"
        aria-label="小云，点击眨眼"
      />
    </div>
  </div>
</template>

<style scoped>
.hero-mascot {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 20rem;
}

.hero-mascot__stage {
  position: relative;
  display: grid;
  place-items: center;
  width: min(100%, 21rem);
  aspect-ratio: 1;
  isolation: isolate;
}

.hero-mascot__halo {
  position: absolute;
  inset: 14%;
  z-index: -1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 42% 36%, rgba(75, 134, 200, 0.24), transparent 62%),
    radial-gradient(circle at 65% 72%, rgba(255, 179, 192, 0.14), transparent 55%);
  filter: blur(18px);
}

.hero-mascot__orbit {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.hero-mascot__orbit--outer {
  inset: 2%;
  border: 1px solid var(--vp-c-divider);
  opacity: 0.76;
}

.hero-mascot__orbit--inner {
  inset: 17%;
  border: 1px dashed var(--vp-c-brand-soft);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 24%, transparent);
  animation: hero-mascot-spin 32s linear infinite;
}

.hero-mascot__spark {
  position: absolute;
  top: 21%;
  right: 12%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  box-shadow:
    -18px 22px 0 -2px var(--vp-c-brand-1),
    11px 34px 0 -2px var(--vp-c-brand-1);
  opacity: 0.34;
}

.hero-mascot__character {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  filter: drop-shadow(0 18px 20px rgba(51, 116, 168, 0.16));
  -webkit-tap-highlight-color: transparent;
}

.hero-mascot__character:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 8px;
  border-radius: 24%;
}

@keyframes hero-mascot-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .hero-mascot {
    min-height: 17rem;
  }

  .hero-mascot__stage {
    width: min(100%, 18rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-mascot__orbit--inner {
    animation: none;
  }
}
</style>
