import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { 'cli': 'bin/el-bot.ts', 'qq-sdk': '../qq-sdk/src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  fixedExtension: true,
  clean: true,
  dts: true,
  alias: {
    '@el-bot/qq-codex/cli': fileURLToPath(new URL('../../apps/qq-codex/src/cli.ts', import.meta.url)),
    'qq-sdk/official': fileURLToPath(new URL('../qq-sdk/src/official/index.ts', import.meta.url)),
    '@el-bot/codex': fileURLToPath(new URL('../codex/src/index.ts', import.meta.url)),
  },
  deps: {
    alwaysBundle: ['@el-bot/qq-codex', 'qq-sdk', '@el-bot/codex'],
    onlyImport: ['@hono/node-server', 'ajv', 'axios', 'commander', 'consola', 'dotenv', 'enquirer', 'hono', 'qq-guild-bot', 'tweetnacl', 'ws'],
  },
})
