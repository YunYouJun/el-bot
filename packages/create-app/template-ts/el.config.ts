import { defineConfig } from 'el-bot'

export default defineConfig({
  napcat: { protocol: 'ws', host: '127.0.0.1', port: 3001, accessToken: '' },
  bot: { master: [], plugins: [], autoloadPlugins: true, pluginDir: 'plugins' },
})
