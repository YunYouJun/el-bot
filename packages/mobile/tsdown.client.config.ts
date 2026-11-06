import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { client: 'src/client.ts' },
  outDir: 'dist',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  clean: false,
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@el-bot/mobile", factory: (require) => {',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
