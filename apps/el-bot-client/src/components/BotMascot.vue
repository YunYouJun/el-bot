<script setup lang="ts">
import type { MascotExpression } from '../runtime-presentation'
import { onMounted, onUnmounted, useTemplateRef } from 'vue'
import cloudSource from '../../../../assets/brand/el-bot-cloud.svg?raw'

const props = withDefaults(defineProps<{
  size?: number
  appearance?: 'plain' | 'app'
  expression?: MascotExpression
}>(), { size: 64, appearance: 'plain', expression: 'idle' })

const shape = cloudSource.match(/<path id="cloud-body" d="([^"]+)"/)?.[1]
const eyes = cloudSource.match(/<path id="cloud-eyes" d="([^"]+)"/)?.[1]
const brandColor = cloudSource.match(/<use href="#cloud-body" fill="(#[\dA-Fa-f]{6})"/)?.[1]
if (!shape || !eyes || !brandColor)
  throw new Error('Missing canonical cloud mascot artwork.')
const artworkTransform = `translate(32 32) scale(${(64 * 0.72) / 52}) translate(-32 -32)`
const avatar = useTemplateRef<HTMLButtonElement>('avatar')
const head = useTemplateRef<HTMLSpanElement>('head')
let media: MediaQueryList | undefined
let active = false
let frame = 0
let previousTime = 0
let x = 0
let y = 0
let targetX = 0
let targetY = 0
let blinkTimer: ReturnType<typeof setTimeout> | undefined
let openEyesTimer: ReturnType<typeof setTimeout> | undefined

function draw() {
  const style = head.value?.style
  if (!style)
    return
  style.setProperty('--roll', `${x * 12}deg`)
  style.setProperty('--yaw', `${x * 15.6}deg`)
  style.setProperty('--pitch', `${y * -9.6}deg`)
  style.setProperty('--head-x', `${x * props.size / 58}px`)
  style.setProperty('--head-y', `${y * props.size / 96}px`)
  style.setProperty('--gaze-x', `${x * 3}px`)
  style.setProperty('--gaze-y', `${y * 2}px`)
}

function animate(time: number) {
  const delta = previousTime ? Math.min(time - previousTime, 40) : 16
  previousTime = time
  const easing = 1 - Math.exp(-delta / 90)
  x += (targetX - x) * easing
  y += (targetY - y) * easing
  draw()
  if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.002) {
    frame = requestAnimationFrame(animate)
  }
  else {
    frame = 0
    previousTime = 0
  }
}

function reset(immediate = false) {
  targetX = targetY = 0
  if (immediate) {
    cancelAnimationFrame(frame)
    frame = previousTime = x = y = 0
    draw()
  }
  else if (!frame) {
    frame = requestAnimationFrame(animate)
  }
}

function track(event: PointerEvent) {
  if (!active || media?.matches || event.pointerType === 'touch' || !avatar.value)
    return
  const bounds = avatar.value.getBoundingClientRect()
  targetX = Math.tanh((event.clientX - bounds.left - bounds.width / 2) / 135)
  targetY = Math.tanh((event.clientY - bounds.top - bounds.height / 2) / 100)
  if (!frame)
    frame = requestAnimationFrame(animate)
}

function leave(event: PointerEvent) {
  if (!event.relatedTarget)
    reset(!active || media?.matches)
}

function blink() {
  if (!active || media?.matches)
    return
  clearTimeout(openEyesTimer)
  head.value?.style.setProperty('--blink', '0.12')
  openEyesTimer = setTimeout(() => head.value?.style.setProperty('--blink', '1'), 120)
}

function scheduleBlink() {
  clearTimeout(blinkTimer)
  if (!active || media?.matches)
    return
  blinkTimer = setTimeout(() => {
    blink()
    scheduleBlink()
  }, 3600 + Math.random() * 3200)
}

function pause() {
  active = false
  clearTimeout(blinkTimer)
  clearTimeout(openEyesTimer)
  head.value?.style.setProperty('--blink', '1')
  reset(true)
}

function resume() {
  pause()
  active = !document.hidden && document.hasFocus()
  scheduleBlink()
}

onMounted(() => {
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  window.addEventListener('pointermove', track, { passive: true })
  window.addEventListener('pointerout', leave)
  window.addEventListener('blur', pause)
  window.addEventListener('focus', resume)
  document.addEventListener('visibilitychange', resume)
  media.addEventListener('change', resume)
  resume()
})

onUnmounted(() => {
  pause()
  window.removeEventListener('pointermove', track)
  window.removeEventListener('pointerout', leave)
  window.removeEventListener('blur', pause)
  window.removeEventListener('focus', resume)
  document.removeEventListener('visibilitychange', resume)
  media?.removeEventListener('change', resume)
})
</script>

<template>
  <button ref="avatar" type="button" class="bot-mascot" :class="[`bot-mascot--${appearance}`, `bot-mascot--${expression}`]" :style="{ 'width': `${size}px`, 'height': `${size}px`, '--mascot-brand': brandColor }" aria-label="和小云打招呼" @click="blink">
    <span ref="head" class="bot-mascot__head">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <g :transform="artworkTransform">
          <path class="bot-mascot__body" :d="shape" />
          <g class="bot-mascot__gaze">
            <path class="bot-mascot__eyes" :d="eyes" />
            <path v-if="size >= 56 && expression === 'happy'" class="bot-mascot__mouth" d="M28.8 41a3.2 3.2 0 0 0 6.4 0" />
            <path v-else-if="size >= 56 && expression === 'error'" class="bot-mascot__mouth" d="M29.5 42h5" />
          </g>
        </g>
      </svg>
    </span>
  </button>
</template>

<style scoped>
.bot-mascot {
  --cloud-color: var(--ylf-c-text, #222733);
  --eye-color: var(--ylf-c-surface, #fff);
  display: grid;
  place-items: center;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: var(--ylf-radius, 12px);
  background: transparent;
  color: inherit;
  perspective: 440px;
  -webkit-tap-highlight-color: transparent;
}
.bot-mascot--app {
  --cloud-color: #fff;
  --eye-color: var(--mascot-brand);
  background: var(--mascot-brand);
}
.bot-mascot:focus-visible {
  outline: 2px solid var(--ylf-c-brand);
  outline-offset: 3px;
}
.bot-mascot__head {
  display: block;
  width: 100%;
  height: 100%;
  transform-origin: 50% 63%;
  transform: translate3d(var(--head-x, 0px), var(--head-y, 0px), 0) rotateX(var(--pitch, 0deg))
    rotateY(var(--yaw, 0deg)) rotateZ(var(--roll, 0deg));
  pointer-events: none;
}
.bot-mascot svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.bot-mascot__body {
  fill: var(--cloud-color);
}
.bot-mascot__gaze {
  transform: translate(var(--gaze-x, 0px), var(--gaze-y, 0px));
}
.bot-mascot__eyes {
  fill: var(--eye-color);
  transform-box: fill-box;
  transform-origin: center;
  transform: scaleY(calc(var(--blink, 1) * var(--squint, 1)));
  transition: transform 75ms ease;
}
.bot-mascot--thinking {
  --squint: 0.65;
}
.bot-mascot--happy {
  --squint: 0.5;
}
.bot-mascot--error {
  --squint: 0.8;
}
.bot-mascot__mouth {
  fill: none;
  stroke: var(--eye-color);
  stroke-width: 1.4;
  stroke-linecap: round;
}
@media (prefers-reduced-motion: reduce) {
  .bot-mascot__head,
  .bot-mascot__gaze {
    transform: none;
  }
  .bot-mascot__eyes {
    transform: scaleY(var(--squint, 1));
    transition: none;
  }
}
</style>
