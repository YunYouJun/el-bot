<script setup lang="ts">
import { isTauri } from '@tauri-apps/api/core'
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef } from 'vue'
import brandMark from '../../../assets/brand/el-bot-mark.svg'
import ConnectionSettings from './components/ConnectionSettings.vue'
import LocalPrograms from './components/LocalPrograms.vue'
import ReplySettings from './components/ReplySettings.vue'
import RuntimeLogs from './components/RuntimeLogs.vue'
import RuntimePanel from './components/RuntimePanel.vue'
import { useBotController } from './composables/useBotController'
import { useTrayActions } from './composables/useTrayActions'

const desktop = isTauri()
const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
function syncTheme() {
  document.documentElement.classList.toggle('ylf-theme-dark', colorScheme.matches)
  document.documentElement.style.colorScheme = colorScheme.matches ? 'dark' : 'light'
}
syncTheme()
onMounted(() => colorScheme.addEventListener('change', syncTheme))
onUnmounted(() => colorScheme.removeEventListener('change', syncTheme))
const pages = {
  runtime: { title: '机器人', description: '查看连接状态，管理本机 AI 助手', icon: 'M12 3v3m-3-3h6M4 13H2m20 0h-2M8 11v3m8-3v3m-8 5h8M7 6h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z' },
  logs: { title: '运行日志', description: '查看最近的连接进度与运行记录', icon: 'M8 7h8M8 12h8m-8 5h5M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z' },
  settings: { title: '连接设置', description: '管理本机路径和 QQ 回复展示', icon: 'M4 7h16M4 17h16M9 4v6m6 4v6' },
}
const tab = shallowRef<keyof typeof pages>('runtime')
const page = computed(() => pages[tab.value])
const { settings, status, pending, error, logs, preferences, act, refresh, readLogs, saveSettings, savePreferences, openProgram } = useBotController()
const runtimePanel = useTemplateRef('runtimePanel')
const { error: trayError } = useTrayActions(async (action) => {
  if (action === 'open-codex' || action === 'open-codebuddy' || action === 'open-dsh' || action === 'open-qq') {
    const programs = { 'open-codex': 'codex', 'open-codebuddy': 'codebuddy', 'open-dsh': 'dsh', 'open-qq': 'qq' } as const
    await openProgram(programs[action])
    return
  }
  if (action === 'settings' || action === 'logs') {
    tab.value = action
    if (action === 'logs')
      await readLogs()
    return
  }
  tab.value = 'runtime'
  await refresh()
  await nextTick()
  if (action === 'start' || action === 'stop' || action === 'restart')
    runtimePanel.value?.requestAction(action)
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-mark" :src="brandMark" alt="" width="40" height="40">
        <div><span class="brand-name">el-bot</span><span class="brand-caption">AI 机器人工作台</span></div>
      </div>
      <nav aria-label="客户端导航">
        <button v-for="(item, key) in pages" :key="key" class="nav-link" :aria-current="tab === key ? 'page' : undefined" @click="tab = key; if (key === 'logs' && desktop) readLogs()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="item.icon" /></svg>
          {{ item.title }}
        </button>
      </nav>
      <p class="sidebar-caption">
        通过 QQ 连接你的 AI 助手
      </p>
    </aside>
    <main class="workspace">
      <header class="page-header">
        <div>
          <h1>{{ page.title }}</h1>
          <p>{{ page.description }}</p>
        </div>
        <YlfButton variant="secondary" size="sm" :disabled="pending || !desktop" @click="refresh">
          刷新状态
        </YlfButton>
      </header>
      <p v-if="error || trayError" :class="desktop ? 'error' : 'notice'" :role="desktop ? 'alert' : 'status'">
        {{ error || trayError }}
      </p>
      <template v-if="tab === 'runtime'">
        <RuntimePanel ref="runtimePanel" :status="status" :pending="pending" @action="act" />
        <LocalPrograms :disabled="pending || !desktop" @open="openProgram" />
      </template>
      <RuntimeLogs v-else-if="tab === 'logs'" :text="logs" :disabled="pending || !desktop" @refresh="readLogs" />
      <template v-else>
        <ConnectionSettings :settings="settings" :disabled="pending || !desktop" @save="saveSettings" />
        <ReplySettings :preferences="preferences" :disabled="pending || !desktop" @save="savePreferences" />
      </template>
    </main>
  </div>
</template>
