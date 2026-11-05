import { createApp } from 'vue'
import PersonaManager from './PersonaManager.vue'
import '@yunlefun/ui/css'
import './style.css'

const scheme = window.matchMedia('(prefers-color-scheme: dark)')
function theme() {
  document.documentElement.classList.toggle('ylf-theme-dark', scheme.matches)
  document.documentElement.style.colorScheme = scheme.matches ? 'dark' : 'light'
}
theme()
scheme.addEventListener('change', theme)
createApp(PersonaManager).mount('#app')
