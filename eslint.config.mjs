import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['**/.nsh/**', '**/.build/**', '**/.swiftpm/**', 'apps/macos/build/**', 'apps/ios/build/**', 'apps/el-bot-client/native/target/**', 'node_modules/', '**/node_modules/**/', 'dist/', '**/dist/**/', 'logs/', '**/logs/**/', 'docs/', '**/docs/**/', 'coverage', '**/coverage/**', 'mcl', '**/mcl/**', 'go-cqhttp', '**/go-cqhttp/**'],
  formatters: true,
  unocss: true,
  vue: true,
}, {
  rules: {
    // for nest import
    'ts/consistent-type-imports': 'off',
  },
}, {
  files: ['apps/el-bot-client/**', 'packages/dsh/web/**'],
  rules: {
    // These views use semantic CSS classes rather than UnoCSS utilities.
    'unocss/order': 'off',
    'unocss/order-attributify': 'off',
  },
})
