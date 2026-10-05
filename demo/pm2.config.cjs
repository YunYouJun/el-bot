module.exports = {
  name: 'el-bot-demo', // Name of your application
  interpreter: 'node',
  script: require.resolve('vite-node/vite-node.mjs'),
  args: 'bot/index.ts',
}
