<script setup lang="ts">
import { computed, markRaw, nextTick, onMounted, onUnmounted, reactive, ref, watchEffect } from 'vue'
import ManualManager from './ManualManager.vue'
import PersonaManager from './PersonaManager.vue'
import ScheduleManager from './ScheduleManager.vue'

const tabs = [
  { id: 'personas', href: '/el-bot/personas/', label: '人物卡' },
  { id: 'manual', href: '/el-bot/manual/', label: '手动接管' },
  { id: 'schedule', href: '/el-bot/schedule/', label: '定时群发' },
] as const

type View = typeof tabs[number]['id']
const titles: Record<View, string> = {
  personas: '人物卡 · el-bot',
  manual: '手动接管 · el-bot',
  schedule: '定时群发 · el-bot',
}

function currentView(): View {
  const params = new URLSearchParams(window.location.search)
  if (window.location.pathname.startsWith('/el-bot/manual') || params.get('view') === 'manual')
    return 'manual'
  if (window.location.pathname.startsWith('/el-bot/schedule') || params.get('view') === 'schedule')
    return 'schedule'
  return 'personas'
}

const view = ref<View>(currentView())
const available = reactive<Record<View, boolean>>({ personas: true, manual: false, schedule: false })
const visibleTabs = computed(() => tabs.filter(tab => available[tab.id]))
const components = {
  personas: markRaw(PersonaManager),
  manual: markRaw(ManualManager),
  schedule: markRaw(ScheduleManager),
}
const activeComponent = computed(() => components[view.value])

function setView(next: View) {
  if (next === view.value)
    return
  view.value = next
  void nextTick(() => window.scrollTo({ top: 0 }))
}

function select(id: View, replace = false) {
  if (id === view.value || !available[id])
    return
  const target = tabs.find(tab => tab.id === id)
  if (!target)
    return
  history[replace ? 'replaceState' : 'pushState']({}, '', target.href)
  setView(id)
}

function sync() {
  const next = currentView()
  setView(available[next] ? next : 'personas')
}

watchEffect(() => {
  document.title = titles[view.value]
})

async function probe(path: string) {
  try {
    const response = await fetch(path, { credentials: 'same-origin', headers: { accept: 'application/json' } })
    return response.ok
  }
  catch {
    return false
  }
}

onMounted(() => {
  window.addEventListener('popstate', sync)
  // Manual takeover and scheduling come from the optional qq-security module.
  for (const tab of tabs) {
    if (tab.id === 'personas')
      continue
    void probe(`${tab.href}api`).then((ok) => {
      available[tab.id] = ok
      if (!ok && view.value === tab.id)
        select('personas', true)
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('popstate', sync)
})
</script>

<template>
  <section class="workspace" aria-label="el-bot 机器人管理">
    <nav class="workspace-tabs" aria-label="机器人管理">
      <a v-for="tab in visibleTabs" :key="tab.id" :href="tab.href" :aria-current="view === tab.id ? 'page' : undefined" @click.prevent="select(tab.id)">
        {{ tab.label }}
      </a>
    </nav>
    <KeepAlive>
      <component :is="activeComponent" />
    </KeepAlive>
  </section>
</template>
