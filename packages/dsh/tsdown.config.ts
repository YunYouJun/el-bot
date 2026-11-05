import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { 'index': 'src/index.ts', 'cli': 'src/cli.ts', 'qq-workspaces': 'src/qq-workspaces/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  fixedExtension: true,
  dts: true,
  clean: true,
  alias: { '@el-bot/persona': fileURLToPath(new URL('../persona/src/index.ts', import.meta.url)) },
  deps: { alwaysBundle: ['@el-bot/persona', 'js-yaml'] },
})
