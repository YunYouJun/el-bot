import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { 'index': 'src/index.ts', 'cli': 'src/cli.ts', 'qq-workspaces': 'src/qq-workspaces/index.ts', 'qq-security': 'src/qq-security/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  fixedExtension: true,
  dts: true,
  clean: true,
  alias: {
    '@el-bot/persona': fileURLToPath(new URL('../persona/src/index.ts', import.meta.url)),
    '@el-bot/commands': fileURLToPath(new URL('../commands/src/index.ts', import.meta.url)),
  },
  deps: { alwaysBundle: ['@el-bot/persona', '@el-bot/commands', 'js-yaml'] },
})
