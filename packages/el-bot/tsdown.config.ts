import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig({
  entry: { 'index': 'index.ts', 'nest': 'core/nest/index.ts', 'cli': 'bin/el-bot.ts', 'qq-sdk': '../qq-sdk/src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  fixedExtension: true,
  clean: true,
  dts: true,
  banner: { dts: '/// <reference path="../types/resty-client.d.ts" />' },
  alias: {
    // mirai-ts 2.4.8 ships index.js but its import condition points to missing index.mjs.
    'mirai-ts': createRequire(import.meta.url).resolve('mirai-ts'),
    '@el-bot/qq-codex/cli': fileURLToPath(new URL('../../apps/qq-codex/src/cli.ts', import.meta.url)),
    'qq-sdk/official': fileURLToPath(new URL('../qq-sdk/src/official/index.ts', import.meta.url)),
    '#qq-sdk': fileURLToPath(new URL('../qq-sdk/src/index.ts', import.meta.url)),
    '@el-bot/codex': fileURLToPath(new URL('../codex/src/index.ts', import.meta.url)),
  },
  deps: {
    // NapCat's ESM output also imports JSON without the Node-required attribute.
    alwaysBundle: ['@el-bot/qq-codex', 'qq-sdk', '@el-bot/codex', 'mirai-ts', /^node-napcat-ts(?:\/|$)/],
    onlyImport: Object.keys(packageJson.dependencies).filter(name => !['mirai-ts', 'node-napcat-ts'].includes(name)),
  },
})
