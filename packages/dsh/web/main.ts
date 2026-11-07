import { createApp } from 'vue'
import AppShell from './AppShell.vue'
import { followHostTheme } from './host-theme'
import './style.css'

let stopTheme = followHostTheme()
function restoreTheme(event: PageTransitionEvent) {
  if (event.persisted)
    stopTheme = followHostTheme()
}
function pauseTheme() {
  stopTheme()
}
window.addEventListener('pagehide', pauseTheme)
window.addEventListener('pageshow', restoreTheme)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopTheme()
    window.removeEventListener('pagehide', pauseTheme)
    window.removeEventListener('pageshow', restoreTheme)
  })
}
createApp(AppShell).mount('#app')
