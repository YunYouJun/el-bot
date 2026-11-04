import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  fixedExtension: true,
  dts: true,
  clean: true,
  publint: true,
  // NapCat imports JSON without the Node-required import attribute.
  deps: { alwaysBundle: [/^node-napcat-ts(?:\/|$)/] },
})
