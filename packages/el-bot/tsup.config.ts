import { defineConfig } from 'tsup'

export default defineConfig({
  clean: true,
  dts: true,
  minify: true,
  entry: ['src/index.ts', 'src/cli/index.ts', 'src/bot/plugins.ts', 'src/plugins/**/index.ts'],
  format: ['esm', 'cjs'],
})
