import type { UnlistenFn } from '@tauri-apps/api/event'
import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { onMounted, onUnmounted, shallowRef } from 'vue'

export type TrayAction = 'runtime' | 'logs' | 'settings' | 'start' | 'stop' | 'restart' | 'open-codex' | 'open-codebuddy' | 'open-dsh' | 'open-qq'

export function useTrayActions(handle: (action: TrayAction) => Promise<void>) {
  const error = shallowRef('')
  let unlisten: UnlistenFn | undefined
  let alive = true
  onMounted(async () => {
    if (!isTauri())
      return
    try {
      const unsubscribe = await listen<TrayAction>('tray-action', ({ payload }) => {
        void handle(payload).catch((e) => {
          error.value = String(e)
        })
      })
      if (alive)
        unlisten = unsubscribe
      else unsubscribe()
    }
    catch { error.value = '菜单栏连接失败，请退出客户端后重新打开。' }
  })
  onUnmounted(() => {
    alive = false
    unlisten?.()
  })
  return { error }
}
