import type { ClientSettings, LocalProgram, Operation, ReplyPreferences, RuntimeStatus } from '../types'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'

export function useBotController() {
  const settings = shallowRef<ClientSettings>()
  const status = shallowRef<RuntimeStatus>()
  const pending = shallowRef(false)
  const actionError = shallowRef('')
  const connectionError = shallowRef('')
  const error = computed(() => actionError.value || connectionError.value)
  const logs = shallowRef('')
  const preferences = shallowRef<ReplyPreferences>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let alive = true
  let revision = 0
  let refreshing = false

  async function command(operation: Operation, interrupt = false) {
    return invoke<RuntimeStatus | { text: string }>('bot_command', { operation, interrupt })
  }
  async function refresh() {
    if (pending.value || refreshing)
      return
    const current = revision
    refreshing = true
    try {
      const value = await command('status') as RuntimeStatus
      if (current === revision) {
        status.value = value
        connectionError.value = ''
      }
    }
    catch (e) {
      if (current === revision)
        connectionError.value = String(e)
    }
    finally { refreshing = false }
  }
  async function act(operation: Exclude<Operation, 'status' | 'logs'>, interrupt = false) {
    if (pending.value)
      return
    pending.value = true
    revision++
    actionError.value = ''
    try {
      status.value = await command(operation, interrupt) as RuntimeStatus
      if (operation === 'start' || operation === 'restart')
        await readPreferences()
    }
    catch (e) { actionError.value = String(e) }
    finally { pending.value = false }
    await refresh()
  }
  async function readLogs() {
    try {
      logs.value = (await command('logs') as { text: string }).text
      actionError.value = ''
    }
    catch (e) { actionError.value = String(e) }
  }
  async function saveSettings(value: ClientSettings) {
    if (pending.value)
      return
    pending.value = true
    try {
      revision++
      settings.value = await invoke<ClientSettings>('save_settings', { settings: value })
      actionError.value = ''
      status.value = undefined
      await readPreferences()
    }
    catch (e) { actionError.value = String(e) }
    finally { pending.value = false }
    await refresh()
  }
  async function readPreferences() {
    preferences.value = undefined
    preferences.value = await invoke<ReplyPreferences>('reply_settings')
  }
  async function savePreferences(value: ReplyPreferences) {
    if (pending.value)
      return
    pending.value = true
    try {
      preferences.value = await invoke<ReplyPreferences>('reply_settings', { messageFormat: value.messageFormat, imageTheme: value.imageTheme })
      actionError.value = ''
    }
    catch (e) { actionError.value = String(e) }
    finally { pending.value = false }
  }
  async function openProgram(program: LocalProgram) {
    if (pending.value)
      return
    pending.value = true
    try {
      await invoke('open_local_program', { program })
      actionError.value = ''
    }
    catch (e) { actionError.value = String(e) }
    finally { pending.value = false }
  }
  async function poll() {
    await refresh()
    if (alive)
      timer = setTimeout(poll, 3000)
  }
  onMounted(async () => {
    if (!isTauri()) {
      connectionError.value = '请在桌面客户端中连接机器人。浏览器预览只展示界面。'
      return
    }
    try {
      settings.value = await invoke<ClientSettings>('load_settings')
    }
    catch (e) { connectionError.value = String(e) }
    try {
      await readPreferences()
    }
    catch (e) { actionError.value = `无法读取展示设置：${String(e)}` }
    await poll()
  })
  onUnmounted(() => {
    alive = false
    clearTimeout(timer)
  })
  return { settings, status, pending, error, logs, preferences, act, refresh, readLogs, saveSettings, savePreferences, openProgram }
}
