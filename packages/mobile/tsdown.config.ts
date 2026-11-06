import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/proxy.ts'],
  format: 'esm',
  target: 'node22',
  dts: true,
  clean: true,
})
