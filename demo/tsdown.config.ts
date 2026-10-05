import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['bot/index.ts'],
  format: ['esm'],
  fixedExtension: false,
  deps: { neverBundle: ['el-bot', 'qq-sdk'] },
})
