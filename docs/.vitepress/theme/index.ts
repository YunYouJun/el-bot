import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import CodexShowcase from '../components/codex/CodexShowcase.vue'
import ChatAvatar from '../components/ChatAvatar.vue'
import ChatMessage from '../components/ChatMessage.vue'
import ChatPanel from '../components/ChatPanel.vue'
import './custom.scss'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('CodexShowcase', CodexShowcase)
    app.component('ChatAvatar', ChatAvatar)
    app.component('ChatMessage', ChatMessage)
    app.component('ChatPanel', ChatPanel)
  },
} satisfies Theme
