<script setup lang="ts">
import { isTauri } from '@tauri-apps/api/core'
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef } from 'vue'
import BotMascot from './components/BotMascot.vue'
import CloudPanel from './components/CloudPanel.vue'
import ConnectionSettings from './components/ConnectionSettings.vue'
import LocalPrograms from './components/LocalPrograms.vue'
import PersonaLibrary from './components/PersonaLibrary.vue'
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
  runtime: { title: '快捷操作', description: '打开云端会话与本机应用', icon: 'M12 3v3m-3-3h6M4 13H2m20 0h-2M8 11v3m8-3v3m-8 5h8M7 6h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z' },
  personas: { title: '人物卡', description: '查看远端人设、快捷切换与打开 Web 管理', icon: 'M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM3 22v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2' },
  settings: { title: '高级设置', description: '配置云端连接、本机路径与回复展示', icon: 'M4 7h16M4 17h16M9 4v6m6 4v6' },
}
const tab = shallowRef<keyof typeof pages>('runtime')
const page = computed(() => pages[tab.value])
const { settings, status, pending, error, connectionError, logs, preferences, act, refresh, readLogs, saveSettings, savePreferences, openProgram, saveCloud, openCloud } = useBotController()
const localExpanded = shallowRef(false)
const logsExpanded = shallowRef(false)
function toggleLocal(event: Event) {
  localExpanded.value = (event.target as HTMLDetailsElement).open
}
function toggleLogs(event: Event) {
  logsExpanded.value = (event.target as HTMLDetailsElement).open
  if (logsExpanded.value && desktop)
    void readLogs()
}
const runtimePanel = useTemplateRef('runtimePanel')
const { error: trayError } = useTrayActions(async (action) => {
  if (action === 'open-cloud') {
    await openCloud()
    return
  }
  if (action === 'open-codex' || action === 'open-codebuddy' || action === 'open-dsh' || action === 'open-qq') {
    const programs = { 'open-codex': 'codex', 'open-codebuddy': 'codebuddy', 'open-dsh': 'dsh', 'open-qq': 'qq' } as const
    await openProgram(programs[action])
    return
  }
  if (action === 'settings' || action === 'logs') {
    tab.value = 'settings'
    if (action === 'logs')
      logsExpanded.value = true
    if (action === 'logs')
      await readLogs()
    return
  }
  tab.value = 'runtime'
  localExpanded.value = true
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
        <BotMascot class="brand-mark" :size="40" appearance="app" />
        <div><span class="brand-name">el-bot</span><span class="brand-caption">AI 机器人工作台</span></div>
      </div>
      <nav aria-label="客户端导航">
        <button v-for="(item, key) in pages" :key="key" class="nav-link" :aria-current="tab === key ? 'page' : undefined" @click="tab = key">
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
        <YlfButton v-if="tab === 'settings' || localExpanded" variant="secondary" size="sm" :disabled="pending || !desktop" @click="refresh">
          刷新本机状态
        </YlfButton>
      </header>
      <p v-if="error || trayError" :class="desktop ? 'error' : 'notice'" :role="desktop ? 'alert' : 'status'">
        {{ error || trayError }}
      </p>
      <template v-if="tab === 'runtime'">
        <CloudPanel :settings="settings?.cloud" :disabled="pending || !desktop" @open="openCloud" @configure="tab = 'settings'" />
        <LocalPrograms :disabled="pending || !desktop" @open="openProgram" />
        <details :open="localExpanded" @toggle="toggleLocal">
          <summary>本机机器人</summary>
          <p v-if="connectionError" class="notice">
            {{ connectionError }}
          </p>
          <RuntimePanel ref="runtimePanel" :status="status" :pending="pending" @action="act" />
        </details>
      </template>
      <PersonaLibrary v-else-if="tab === 'personas'" :cloud="settings?.cloud" :disabled="pending || !desktop" />
      <template v-else>
        <CloudPanel :settings="settings?.cloud" :disabled="pending || !desktop" editable @save="saveCloud" />
        <ConnectionSettings :settings="settings" :disabled="pending || !desktop" @save="saveSettings" />
        <ReplySettings :preferences="preferences" :disabled="pending || !desktop" @save="savePreferences" />
        <details :open="logsExpanded" @toggle="toggleLogs">
          <summary>本机运行日志</summary>
          <RuntimeLogs :text="logs" :disabled="pending || !desktop" @refresh="readLogs" />
        </details>
      </template>
    </main>
  </div>
</template>
