import type { Config } from '@koishijs/plugin-respondent'

export const config: Config = {
  rules: [
    {
      match: '在吗',
      reply: '爪巴',
    },
    {
      match: /^(.+)一时爽$/,
      reply: (_, str) => `一直${str}一直爽`,
    },
  ],
}
