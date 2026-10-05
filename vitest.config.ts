import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: {
    'qq-sdk/official': fileURLToPath(new URL('./packages/qq-sdk/src/official/index.ts', import.meta.url)),
    'qq-sdk': fileURLToPath(new URL('./packages/qq-sdk/src/index.ts', import.meta.url)),
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
