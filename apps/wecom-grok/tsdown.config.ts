import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  fixedExtension: true,
  clean: true,
  // The private application deploys as an artifact without workspace dependencies.
  deps: { alwaysBundle: [/^[^./]/], onlyBundle: false },
})
