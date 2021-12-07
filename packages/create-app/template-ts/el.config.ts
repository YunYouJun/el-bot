import { defineConfig } from 'el-bot'

export default defineConfig({
  qq: 712727946,
  // 你可以直接解析你的 mirai/mcl 中 mirai-api-http 的配置
  // 你应当将其修改为你的相对路径或绝对路径
  setting: './mcl/config/net.mamoe.mirai-api-http/setting.yml',
  bot: {
    master: [910426929],
    plugins: {
      default: ['answer'],
      custom: ['./src/plugins/test'],
    },
  },
})
