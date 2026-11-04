import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', client: 'src/client.ts', cli: 'src/cli.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  fixedExtension: true,
  dts: true,
  clean: true,
  publint: true,
})
