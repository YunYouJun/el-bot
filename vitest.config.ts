import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: {
    'el-bot/adapter': fileURLToPath(new URL('./packages/el-bot/core/adapter.ts', import.meta.url)),
    '#plugin-qq': fileURLToPath(new URL('./packages/plugin-qq/src/index.ts', import.meta.url)),
    '@el-bot/plugin-qq': fileURLToPath(new URL('./packages/plugin-qq/src/index.ts', import.meta.url)),
    '@el-bot/plugin-wecom': fileURLToPath(new URL('./packages/plugin-wecom/src/index.ts', import.meta.url)),
    '@el-bot/plugin-grok': fileURLToPath(new URL('./packages/plugin-grok/src/index.ts', import.meta.url)),
    // Match the framework build alias for mirai-ts's missing ESM entry.
    'mirai-ts': createRequire(import.meta.url).resolve('mirai-ts'),
    'el-bot/nest': fileURLToPath(new URL('./packages/el-bot/core/nest/index.ts', import.meta.url)),
    'el-bot': fileURLToPath(new URL('./packages/el-bot/index.ts', import.meta.url)),
    'qq-sdk/official': fileURLToPath(new URL('./packages/qq-sdk/src/official/index.ts', import.meta.url)),
    'qq-sdk': fileURLToPath(new URL('./packages/qq-sdk/src/index.ts', import.meta.url)),
    '#qq-sdk': fileURLToPath(new URL('./packages/qq-sdk/src/index.ts', import.meta.url)),
    '@el-bot/codex': fileURLToPath(new URL('./packages/codex/src/index.ts', import.meta.url)),
  } },
  test: {
    environment: 'node',
    include: [
      'test/**/*.test.ts',
      'packages/*/{src,test}/**/*.test.ts',
      'apps/*/{src,test}/**/*.test.ts',
    ],
    restoreMocks: true,
  },
})
