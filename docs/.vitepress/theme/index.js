import DefaultTheme from "vitepress/theme";

import "./custom.scss";

import ChatAvatar from "../components/ChatAvatar.vue";
import ChatMessage from "../components/ChatMessage.vue";
import ChatPanel from "../components/ChatPanel.vue";

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component("ChatAvatar", ChatAvatar);
    app.component("ChatMessage", ChatMessage);
    app.component("ChatPanel", ChatPanel);
  },
};
