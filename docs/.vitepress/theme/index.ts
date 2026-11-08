import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import CodexShowcase from '../components/codex/CodexShowcase.vue'
import FlowDiagram from '../components/FlowDiagram.vue'
import ChatAvatar from '../components/ChatAvatar.vue'
import ChatMessage from '../components/ChatMessage.vue'
import ChatPanel from '../components/ChatPanel.vue'
import Layout from './Layout.vue'
import './custom.scss'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('CodexShowcase', CodexShowcase)
    app.component('FlowDiagram', FlowDiagram)
    app.component('ChatAvatar', ChatAvatar)
    app.component('ChatMessage', ChatMessage)
    app.component('ChatPanel', ChatPanel)
  },
} satisfies Theme
