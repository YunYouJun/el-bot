import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  fixedExtension: false,
  dts: true,
  minify: true,
  entry: ['src/index.ts'],
  deps: { neverBundle: ['el-bot', 'axios', 'mirai-ts'] },
})
