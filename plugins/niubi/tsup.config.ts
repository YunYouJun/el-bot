import { defineConfig } from 'tsup'

export default defineConfig({
  clean: true,
  dts: true,
  minify: true,
  entryPoints: ['src/index.ts'],
  external: ['el-bot', 'axios', 'mirai-ts'],
})
