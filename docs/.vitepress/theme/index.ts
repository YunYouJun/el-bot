import { VPTheme } from "vitepress-theme-you";

import "./custom.scss";

import ChatAvatar from "../components/ChatAvatar.vue";
import ChatMessage from "../components/ChatMessage.vue";
import ChatPanel from "../components/ChatPanel.vue";

import 'uno.css'

export default Object.assign({}, VPTheme, {
  enhanceApp({ app }) {
    app.component("ChatAvatar", ChatAvatar);
    app.component("ChatMessage", ChatMessage);
    app.component("ChatPanel", ChatPanel);
  },
})
