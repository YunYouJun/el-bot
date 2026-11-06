import { createApp } from 'vue'
import { followHostTheme } from './host-theme'
import ManualManager from './ManualManager.vue'
import PersonaManager from './PersonaManager.vue'
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
const manual = window.location.pathname.startsWith('/el-bot/manual')
document.title = manual ? '手动接管 · el-bot' : '人物卡 · el-bot'
createApp(manual ? ManualManager : PersonaManager).mount('#app')
