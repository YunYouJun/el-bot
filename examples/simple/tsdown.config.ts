import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  clean: true,
  fixedExtension: false,
  // dts: true,
  format: ['esm'],
  deps: { neverBundle: ['el-bot', 'qq-sdk'] },
})
