<script setup lang="ts">
import type { LocalProgram } from '../types'
import codebuddyLogo from '../assets/programs/codebuddy.svg'
import codexDarkLogo from '../assets/programs/codex-dark.png'
import codexLightLogo from '../assets/programs/codex-light.png'
import dshLogo from '../assets/programs/dsh.svg'
import qqLogo from '../assets/programs/qq.png'

defineProps<{ program: LocalProgram }>()
const logos: Record<LocalProgram, string> = {
  codex: codexLightLogo,
  codebuddy: codebuddyLogo,
  dsh: dshLogo,
  qq: qqLogo,
}
</script>

<template>
  <picture v-if="program === 'codex'" class="program-logo">
    <source :srcset="codexDarkLogo" media="(prefers-color-scheme: dark)">
    <img :src="codexLightLogo" alt="" width="18" height="18" draggable="false">
  </picture>
  <img v-else class="program-logo" :src="logos[program]" alt="" width="18" height="18" draggable="false">
</template>

<style scoped>
.program-logo {
  display: block;
  flex: none;
  width: 18px;
  height: 18px;
  object-fit: contain;
}
.program-logo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
